const eastmoney = require('./eastmoney');
const tencent = require('./tencent');
const { UpstreamError } = require('./http');
const { digits, exchangeSymbol, marketOf, securityTypeOf, normalizeWatchItem } = require('./symbols');

function finite(value, fallback = NaN) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function shanghaiParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function marketIsOpen(value = new Date()) {
  const parts = shanghaiParts(value);
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return false;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return (minutes >= 570 && minutes <= 690) || (minutes >= 780 && minutes < 900);
}

function isFresh(record, now = new Date(), toleranceMs = 90000) {
  if (!record?.source_time) return false;
  if (!marketIsOpen(now)) return true;
  const source = new Date(record.source_time);
  if (Number.isNaN(source.getTime())) return false;
  return Math.abs(now.getTime() - source.getTime()) <= toleranceMs;
}

function validQuote(record) {
  const quote = record?.quote || {};
  return ['price', 'previous_close', 'open', 'high', 'low', 'volume'].every((field) => Number.isFinite(finite(quote[field])))
    && quote.price > 0
    && quote.previous_close > 0
    && quote.open > 0
    && quote.high >= quote.low
    && quote.low > 0
    && quote.volume >= 0;
}

function priceDifference(left, right) {
  const first = finite(left?.quote?.price);
  const second = finite(right?.quote?.price);
  if (!(first > 0 && second > 0)) return Infinity;
  return Math.abs(first - second) / Math.max(first, second);
}

function errorRecord(provider, error) {
  return { provider, code: error?.code || 'unknown_error', message: error?.message || '未知错误' };
}

async function settle(operation, provider) {
  try {
    return { ok: true, provider, value: await operation() };
  } catch (error) {
    return { ok: false, provider, error };
  }
}

async function fetchBestQuote(symbol, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const providerOptions = { fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs };
  const [eastResult, tencentResult] = await Promise.all([
    settle(() => eastmoney.fetchQuote(symbol, providerOptions), 'eastmoney'),
    settle(() => tencent.fetchQuote(symbol, providerOptions), 'tencent')
  ]);
  const errors = [eastResult, tencentResult].filter((result) => !result.ok).map((result) => errorRecord(result.provider, result.error));
  const eastValid = eastResult.ok && validQuote(eastResult.value) && isFresh(eastResult.value, now);
  const tencentValid = tencentResult.ok && validQuote(tencentResult.value) && isFresh(tencentResult.value, now);

  if (eastValid && tencentValid) {
    const difference = priceDifference(eastResult.value, tencentResult.value);
    if (difference > 0.005) {
      return { ok: false, code: 'data_conflict', message: `东方财富与腾讯最新价差异${(difference * 100).toFixed(2)}%`, errors, candidates: [eastResult.value, tencentResult.value] };
    }
    return { ok: true, value: eastResult.value, verification_source: 'tencent', difference, errors };
  }
  if (eastValid) return { ok: true, value: eastResult.value, verification_source: null, errors };
  if (tencentValid) return { ok: true, value: tencentResult.value, verification_source: null, fallback: true, errors };

  if (eastResult.ok && !isFresh(eastResult.value, now)) errors.push({ provider: 'eastmoney', code: 'stale_quote', message: '东方财富行情超过90秒' });
  if (tencentResult.ok && !isFresh(tencentResult.value, now)) errors.push({ provider: 'tencent', code: 'stale_quote', message: '腾讯行情超过90秒' });
  return { ok: false, code: 'all_quote_sources_failed', message: '东方财富和腾讯行情均不可用', errors };
}

function historyPreviousClose(history, sourceTime) {
  const bars = history?.bars || [];
  if (!bars.length) return NaN;
  const sourceDate = String(sourceTime || '').slice(0, 10);
  const last = bars.at(-1);
  if (last.date === sourceDate && bars.length > 1) return bars.at(-2).close;
  return last.close;
}

function historyMatchesQuote(history, quoteRecord, tolerance = 0.005) {
  const historyClose = finite(historyPreviousClose(history, quoteRecord.source_time));
  const previousClose = finite(quoteRecord?.quote?.previous_close);
  if (!(historyClose > 0 && previousClose > 0)) return false;
  return Math.abs(historyClose - previousClose) / Math.max(historyClose, previousClose) <= tolerance;
}

async function fetchBestHistory(symbol, quoteRecord, options = {}) {
  const providerOptions = { fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs };
  const [eastResult, tencentResult] = await Promise.all([
    settle(() => eastmoney.fetchHistory(symbol, providerOptions), 'eastmoney'),
    settle(() => tencent.fetchHistory(symbol, providerOptions), 'tencent')
  ]);
  const errors = [eastResult, tencentResult].filter((result) => !result.ok).map((result) => errorRecord(result.provider, result.error));
  const ordered = quoteRecord.source === 'eastmoney' ? [eastResult, tencentResult] : [tencentResult, eastResult];
  for (const result of ordered) {
    if (!result.ok) continue;
    if (historyMatchesQuote(result.value, quoteRecord)) return { ok: true, value: result.value, fallback: result.provider !== quoteRecord.source, errors };
    errors.push({ provider: result.provider, code: 'history_conflict', message: `${result.provider}历史收盘与实时昨收不一致` });
  }
  return { ok: false, code: 'all_history_sources_failed', message: '东方财富和腾讯历史K线均不可用或口径冲突', errors };
}

async function fetchMarketData(symbol, options = {}) {
  const code = digits(symbol);
  const fetchedAt = new Date(options.now || Date.now()).toISOString();
  if (!code) {
    return {
      symbol: String(symbol || ''), name: String(options.name || symbol || ''), source: 'none', fetched_at: fetchedAt,
      quote: {}, daily_bars: [], data_quality: { valid: false, conflict: false, stale: false, missing: ['证券代码无效'], error_code: 'invalid_symbol', errors: [] }
    };
  }
  const quoteResult = await fetchBestQuote(code, options);
  if (!quoteResult.ok) {
    return {
      symbol: exchangeSymbol(code), name: options.name || code, market: marketOf(code), security_type: securityTypeOf(code, options.name), source: 'none', fetched_at: fetchedAt,
      quote: {}, daily_bars: [], data_quality: { valid: false, conflict: quoteResult.code === 'data_conflict', stale: false, missing: [quoteResult.message], error_code: quoteResult.code, errors: quoteResult.errors || [] }
    };
  }
  const quoteRecord = quoteResult.value;
  const historyResult = await fetchBestHistory(code, quoteRecord, options);
  if (!historyResult.ok) {
    return {
      ...quoteRecord,
      name: options.name || quoteRecord.name,
      fetched_at: fetchedAt,
      daily_bars: [],
      data_quality: { valid: false, conflict: true, stale: false, missing: [historyResult.message], error_code: historyResult.code, errors: [...(quoteResult.errors || []), ...(historyResult.errors || [])] }
    };
  }
  return {
    ...quoteRecord,
    name: options.name || quoteRecord.name,
    fetched_at: fetchedAt,
    verification_source: quoteResult.verification_source,
    history_source: historyResult.value.source,
    daily_bars: historyResult.value.bars,
    data_quality: {
      valid: true,
      conflict: false,
      stale: false,
      fallback: Boolean(quoteResult.fallback || historyResult.fallback),
      missing: [],
      error_code: null,
      errors: [...(quoteResult.errors || []), ...(historyResult.errors || [])]
    }
  };
}

async function searchSymbol(query, options = {}) {
  const code = digits(query);
  if (code) return { symbol: exchangeSymbol(code), name: options.name || '', security_type: securityTypeOf(code, options.name) };
  const text = String(query || '').replace(/^NAME:/, '').trim();
  if (!text) throw new UpstreamError('empty_search', '请输入股票代码或名称');
  const providerOptions = { fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs };
  const eastResult = await settle(() => eastmoney.search(text, providerOptions), 'eastmoney');
  if (eastResult.ok && eastResult.value.length) return eastResult.value[0];
  const tencentResult = await settle(() => tencent.search(text, providerOptions), 'tencent');
  if (tencentResult.ok && tencentResult.value.length) return tencentResult.value[0];
  throw new UpstreamError('symbol_not_found', `未找到“${text}”，请改用6位证券代码`);
}

async function resolveWatchItem(item, options = {}) {
  const normalized = normalizeWatchItem(item);
  const resolved = await searchSymbol(normalized.symbol || normalized.name, { ...options, name: normalized.name });
  return { ...resolved, name: normalized.name || resolved.name, watch_key: normalized.symbol || resolved.symbol };
}

async function fetchWatchlist(watchlist, options = {}) {
  const items = (Array.isArray(watchlist) ? watchlist : []).slice(0, 30);
  const resolved = await Promise.all(items.map(async (item) => {
    try {
      return await resolveWatchItem(item, options);
    } catch (error) {
      const normalized = normalizeWatchItem(item);
      return { symbol: normalized.symbol, name: normalized.name || normalized.symbol, watch_key: normalized.symbol, resolve_error: error.message };
    }
  }));
  const stocks = await Promise.all(resolved.map(async (item) => {
    if (item.resolve_error) return fetchMarketData('', { ...options, name: item.name }).then((data) => ({ ...data, symbol: item.symbol, name: item.name, watch_key: item.watch_key }));
    const data = await fetchMarketData(item.symbol, { ...options, name: item.name });
    return { ...data, watch_key: item.watch_key };
  }));
  return stocks;
}

module.exports = {
  shanghaiParts,
  marketIsOpen,
  isFresh,
  validQuote,
  priceDifference,
  historyPreviousClose,
  historyMatchesQuote,
  fetchBestQuote,
  fetchBestHistory,
  fetchMarketData,
  searchSymbol,
  resolveWatchItem,
  fetchWatchlist
};
