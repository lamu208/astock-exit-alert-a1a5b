const fuyao = require('./fuyao');
const eastmoney = require('./eastmoney');
const tencent = require('./tencent');
const tongdaxin = require('./tongdaxin');
const { UpstreamError } = require('./http');
const { digits, exchangeSymbol, marketOf, resolveKnownIndex, securityTypeOf, normalizeWatchItem } = require('./symbols');

const PROVIDERS = [
  { name: 'fuyao', client: fuyao },
  { name: 'eastmoney', client: eastmoney },
  { name: 'tencent', client: tencent },
  { name: 'tongdaxin', client: tongdaxin }
];

const HISTORY_PROVIDERS = [
  { name: 'tencent', client: tencent },
  { name: 'eastmoney', client: eastmoney },
  { name: 'fuyao', client: fuyao },
  { name: 'tongdaxin', client: tongdaxin }
];

const symbolCache = new Map();

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
  return {
    provider,
    code: error?.code || 'unknown_error',
    message: error?.message || '未知错误'
  };
}

function optionsFor(provider, options = {}) {
  const defaults = provider === 'fuyao' ? 4500 : provider === 'tongdaxin' ? 3500 : 3000;
  return {
    fetchImpl: options.fetchImpl,
    timeoutMs: Number(options.timeoutMs) || defaults,
    now: options.now,
    name: options.name,
    isIndex: Boolean(options.isIndex),
    securityType: options.securityType,
    apiKey: options.fuyaoApiKey,
    clientFactory: options.tdxClientFactory,
    library: options.tdxLibrary
  };
}

async function settle(operation, provider) {
  try {
    return { ok: true, provider, value: await operation() };
  } catch (error) {
    return { ok: false, provider, error };
  }
}

function providersFrom(source) {
  const index = Math.max(0, PROVIDERS.findIndex((provider) => provider.name === source));
  return PROVIDERS.slice(index);
}

async function fetchBestQuote(symbol, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const errors = [];
  for (let index = 0; index < PROVIDERS.length; index += 1) {
    const provider = PROVIDERS[index];
    const result = await settle(
      () => provider.client.fetchQuote(symbol, optionsFor(provider.name, { ...options, now })),
      provider.name
    );
    if (!result.ok) {
      errors.push(errorRecord(provider.name, result.error));
      continue;
    }
    if (!validQuote(result.value)) {
      errors.push({ provider: provider.name, code: 'invalid_quote', message: `${provider.name} 行情字段不完整` });
      continue;
    }
    if (!isFresh(result.value, now)) {
      errors.push({ provider: provider.name, code: 'stale_quote', message: `${provider.name} 行情超过90秒` });
      continue;
    }
    return {
      ok: true,
      value: result.value,
      fallback: index > 0,
      fallback_level: index,
      errors
    };
  }
  return {
    ok: false,
    code: 'all_quote_sources_failed',
    message: '扶摇、东方财富、腾讯和通达信实时行情均不可用',
    errors
  };
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
  const errors = [];
  for (const provider of HISTORY_PROVIDERS) {
    const result = await settle(
      () => provider.client.fetchHistory(symbol, optionsFor(provider.name, options)),
      provider.name
    );
    if (!result.ok) {
      errors.push(errorRecord(provider.name, result.error));
      continue;
    }
    if (!historyMatchesQuote(result.value, quoteRecord)) {
      errors.push({ provider: provider.name, code: 'history_conflict', message: `${provider.name} 历史K线与实时昨收不一致` });
      continue;
    }
    return {
      ok: true,
      value: result.value,
      fallback: provider.name !== HISTORY_PROVIDERS[0].name,
      errors
    };
  }
  return {
    ok: false,
    code: 'all_history_sources_failed',
    message: '可用历史K线不足或与实时昨收冲突',
    errors
  };
}

async function fetchMarketData(symbol, options = {}) {
  const code = digits(symbol);
  const normalizedSymbol = exchangeSymbol(symbol);
  const fetchedAt = new Date(options.now || Date.now()).toISOString();
  if (!code) {
    return {
      symbol: String(symbol || ''),
      name: String(options.name || symbol || ''),
      source: 'none',
      fetched_at: fetchedAt,
      quote: {},
      daily_bars: [],
      data_quality: {
        valid: false,
        conflict: false,
        stale: false,
        missing: ['证券代码无效'],
        error_code: 'invalid_symbol',
        errors: []
      }
    };
  }
  const isIndex = Boolean(options.isIndex || resolveKnownIndex(symbol) || resolveKnownIndex(options.name));
  const securityType = isIndex ? 'INDEX' : (options.securityType || securityTypeOf(normalizedSymbol, options.name));
  const requestOptions = {
    ...options,
    name: options.name,
    isIndex,
    securityType
  };
  const quoteResult = await fetchBestQuote(normalizedSymbol, requestOptions);
  if (!quoteResult.ok) {
    return {
      symbol: normalizedSymbol,
      name: options.name || code,
      market: marketOf(normalizedSymbol),
      security_type: securityType,
      source: 'none',
      fetched_at: fetchedAt,
      quote: {},
      daily_bars: [],
      data_quality: {
        valid: false,
        conflict: false,
        stale: false,
        missing: [quoteResult.message],
        error_code: quoteResult.code,
        errors: quoteResult.errors || []
      }
    };
  }
  const quoteRecord = quoteResult.value;
  const historyResult = await fetchBestHistory(normalizedSymbol, quoteRecord, requestOptions);
  if (!historyResult.ok) {
    return {
      ...quoteRecord,
      symbol: normalizedSymbol,
      name: options.name || quoteRecord.name,
      security_type: securityType,
      fetched_at: fetchedAt,
      daily_bars: [],
      data_quality: {
        valid: false,
        conflict: true,
        stale: false,
        missing: [historyResult.message],
        error_code: historyResult.code,
        errors: [...(quoteResult.errors || []), ...(historyResult.errors || [])]
      }
    };
  }
  return {
    ...quoteRecord,
    symbol: normalizedSymbol,
    name: options.name || quoteRecord.name,
    security_type: securityType,
    fetched_at: fetchedAt,
    verification_source: null,
    history_source: historyResult.value.source,
    history_adjustment: historyResult.value.adjustment || 'unknown',
    daily_bars: historyResult.value.bars,
    data_quality: {
      valid: true,
      conflict: false,
      stale: false,
      fallback: Boolean(quoteResult.fallback || historyResult.fallback),
      fallback_level: quoteResult.fallback_level,
      missing: [],
      error_code: null,
      errors: [...(quoteResult.errors || []), ...(historyResult.errors || [])]
    }
  };
}

function bestSearchMatch(results, query) {
  const code = digits(query);
  if (code) return results.find((item) => digits(item.symbol) === code) || results[0];
  const text = String(query || '').trim();
  return results.find((item) => item.name === text) || results[0];
}

async function searchSymbol(query, options = {}) {
  const knownIndex = resolveKnownIndex(query) || resolveKnownIndex(options.name);
  if (knownIndex) {
    return {
      symbol: knownIndex.symbol,
      name: options.name || knownIndex.name,
      security_type: 'INDEX',
      is_index: true
    };
  }
  const code = digits(query);
  const text = String(query || '').replace(/^NAME:/, '').trim();
  if (!text && !code) throw new UpstreamError('empty_search', '请输入股票代码或名称');
  if (code && options.name) {
    return { symbol: exchangeSymbol(code), name: options.name, security_type: securityTypeOf(code, options.name) };
  }
  const cacheKey = code || text.toLowerCase();
  if (symbolCache.has(cacheKey)) return symbolCache.get(cacheKey);
  const searchProviders = [
    { name: 'fuyao', client: fuyao },
    { name: 'eastmoney', client: eastmoney },
    { name: 'tencent', client: tencent }
  ];
  for (const provider of searchProviders) {
    const result = await settle(
      () => provider.client.search(code || text, optionsFor(provider.name, options)),
      provider.name
    );
    if (!result.ok || !result.value.length) continue;
    const match = bestSearchMatch(result.value, code || text);
    if (!match) continue;
    symbolCache.set(cacheKey, match);
    return match;
  }
  if (code) {
    const fallback = { symbol: exchangeSymbol(code), name: '', security_type: securityTypeOf(code) };
    symbolCache.set(cacheKey, fallback);
    return fallback;
  }
  throw new UpstreamError('symbol_not_found', `未找到“${text}”，请直接输入6位证券代码`);
}

async function resolveWatchItem(item, options = {}) {
  const normalized = normalizeWatchItem(item);
  const resolved = await searchSymbol(normalized.symbol || normalized.name, { ...options, name: normalized.name });
  return {
    ...resolved,
    name: normalized.name || resolved.name,
    security_type: normalized.security_type || resolved.security_type,
    is_index: Boolean(normalized.is_index || resolved.is_index || resolved.security_type === 'INDEX'),
    watch_key: normalized.symbol || resolved.symbol
  };
}

async function fetchWatchlist(watchlist, options = {}) {
  const items = (Array.isArray(watchlist) ? watchlist : []).slice(0, 30);
  const resolved = await Promise.all(items.map(async (item) => {
    try {
      return await resolveWatchItem(item, options);
    } catch (error) {
      const normalized = normalizeWatchItem(item);
      return {
        symbol: normalized.symbol,
        name: normalized.name || normalized.symbol,
        watch_key: normalized.symbol,
        resolve_error: error.message
      };
    }
  }));
  return Promise.all(resolved.map(async (item) => {
    if (item.resolve_error) {
      const data = await fetchMarketData('', { ...options, name: item.name });
      return { ...data, symbol: item.symbol, name: item.name, watch_key: item.watch_key };
    }
    const data = await fetchMarketData(item.symbol, {
      ...options,
      name: item.name,
      securityType: item.security_type,
      isIndex: Boolean(item.is_index || item.security_type === 'INDEX')
    });
    return { ...data, watch_key: item.watch_key };
  }));
}

module.exports = {
  PROVIDERS,
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
