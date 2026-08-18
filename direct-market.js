(function directMarketModule(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DirectMarket = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDirectMarket(root) {
  const REQUEST_TIMEOUT = 6500;
  let requestSequence = 0;

  function finite(value, fallback = NaN) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function digits(value) {
    const match = String(value || '').match(/\d{6}/);
    return match ? match[0] : '';
  }

  function explicitMarket(value) {
    const match = String(value || '').match(/(?:\.|^)(SH|SZ|BJ)$/i);
    return match ? match[1].toUpperCase() : '';
  }

  function marketOf(value) {
    const explicit = explicitMarket(value);
    if (explicit) return explicit;
    const code = digits(value);
    if (code.startsWith('4') || code.startsWith('8')) return 'BJ';
    if (code.startsWith('5') || code.startsWith('6') || code.startsWith('9')) return 'SH';
    return 'SZ';
  }

  function exchangeSymbol(value) {
    const code = digits(value);
    return code ? `${code}.${marketOf(value)}` : '';
  }

  function eastmoneySecIds(value) {
    const code = digits(value);
    if (!code) return [];
    const market = marketOf(value);
    if (market === 'SH') return [`1.${code}`, `0.${code}`];
    if (market === 'SZ') return [`0.${code}`, `1.${code}`];
    return [`0.${code}`, `1.${code}`];
  }

  function tencentKey(value) {
    const code = digits(value);
    return code ? `${marketOf(value).toLowerCase()}${code}` : '';
  }

  function securityTypeOf(value, name = '') {
    const code = digits(value);
    return /ETF|LOF|基金/i.test(name) || /^(15|16|50|51|52|56|58|59)\d{4}$/.test(code) ? 'ETF' : 'STOCK';
  }

  function sourceTime(value) {
    const timestamp = finite(value);
    if (!(timestamp > 0)) return new Date().toISOString();
    return new Date(timestamp > 1000000000000 ? timestamp : timestamp * 1000).toISOString();
  }

  function parseTencentSourceTime(value) {
    const match = String(value || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
    if (!match) return new Date().toISOString();
    return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+08:00`;
  }

  function parseEastmoneyQuote(payload, requestedSymbol = '') {
    const data = payload?.data;
    const code = digits(data?.f57 || requestedSymbol);
    if (!code) throw new Error('东方财富未返回证券代码');
    const decimals = finite(data?.f59);
    const divisor = Number.isFinite(decimals) && decimals >= 0 && decimals <= 6 ? 10 ** decimals : 100;
    const price = finite(data?.f43) / divisor;
    const previousClose = finite(data?.f60) / divisor;
    const open = finite(data?.f46) / divisor;
    const high = finite(data?.f44) / divisor;
    const low = finite(data?.f45) / divisor;
    if (![price, previousClose, open, high, low].every((item) => Number.isFinite(item) && item > 0)) {
      throw new Error('东方财富实时行情字段不完整');
    }
    const symbol = exchangeSymbol(`${code}.${marketOf(requestedSymbol || code)}`);
    const name = String(data?.f58 || code);
    return {
      symbol,
      name,
      market: marketOf(symbol),
      security_type: securityTypeOf(code, name),
      source: 'eastmoney',
      source_label: '东方财富',
      source_time: sourceTime(data?.f86),
      quote: {
        price,
        previous_close: previousClose,
        open,
        high,
        low,
        volume: finite(data?.f47, 0),
        amount: finite(data?.f48, 0),
        change_pct: finite(data?.f170, 0) / 100
      }
    };
  }

  function parseEastmoneyHistory(payload, symbol, name = '') {
    const lines = payload?.data?.klines;
    if (!Array.isArray(lines)) throw new Error('东方财富未返回日K数据');
    const bars = lines.map((line) => {
      const fields = String(line).split(',');
      return {
        date: fields[0],
        open: finite(fields[1]),
        close: finite(fields[2]),
        high: finite(fields[3]),
        low: finite(fields[4]),
        volume: finite(fields[5]),
        amount: finite(fields[6], 0)
      };
    }).filter(validBar);
    if (bars.length < 20) throw new Error('东方财富历史K线不足20日');
    return { symbol: exchangeSymbol(symbol), name: payload?.data?.name || name || digits(symbol), source: 'eastmoney', source_label: '东方财富', adjustment: 'qfq', bars };
  }

  function parseTencentQuote(content, requestedSymbol = '') {
    const values = String(content || '').replace(/^"|";?$/g, '').split('~');
    const code = digits(values[2] || requestedSymbol);
    const price = finite(values[3]);
    const previousClose = finite(values[4]);
    const open = finite(values[5]);
    const high = finite(values[33]);
    const low = finite(values[34]);
    if (!code || ![price, previousClose, open, high, low].every((item) => Number.isFinite(item) && item > 0)) {
      throw new Error('腾讯实时行情字段不完整');
    }
    const name = String(values[1] || code);
    const symbol = exchangeSymbol(`${code}.${marketOf(requestedSymbol || code)}`);
    return {
      symbol,
      name,
      market: marketOf(symbol),
      security_type: securityTypeOf(code, name),
      source: 'tencent',
      source_label: '腾讯备用源',
      source_time: parseTencentSourceTime(values[30]),
      quote: {
        price,
        previous_close: previousClose,
        open,
        high,
        low,
        volume: finite(values[36], finite(values[6], 0)),
        amount: finite(values[37], 0) * 10000,
        change_pct: finite(values[32], 0) / 100
      }
    };
  }

  function parseTencentHistory(payload, symbol) {
    const key = tencentKey(symbol);
    const entry = payload?.data?.[key] || {};
    const rows = Array.isArray(entry.qfqday) && entry.qfqday.length ? entry.qfqday : entry.day || [];
    const bars = (Array.isArray(rows) ? rows : []).map((row) => ({
      date: String(row[0] || ''),
      open: finite(row[1]),
      close: finite(row[2]),
      high: finite(row[3]),
      low: finite(row[4]),
      volume: finite(row[5]),
      amount: finite(row[6], 0)
    })).filter(validBar);
    if (bars.length < 20) throw new Error('腾讯历史K线不足20日');
    return { symbol: exchangeSymbol(symbol), source: 'tencent', source_label: '腾讯决策日K', adjustment: 'qfq', bars };
  }

  function validBar(bar) {
    return [bar.open, bar.close, bar.high, bar.low, bar.volume].every(Number.isFinite) && bar.close > 0 && bar.high >= bar.low;
  }

  function parseEastmoneySuggestions(payload) {
    const rows = payload?.QuotationCodeTable?.Data || payload?.QuotationCodeTable?.data || payload?.data || [];
    return (Array.isArray(rows) ? rows : []).map((row) => {
      const code = digits(row.Code || row.code || row.SecurityCode || row.securityCode);
      const name = String(row.Name || row.name || row.SecurityName || row.securityName || '');
      const market = String(row.MktNum || row.mktNum || '').toLowerCase();
      const suffix = market === '1' || market === 'sh' ? 'SH' : market === '0' || market === 'sz' ? 'SZ' : marketOf(code);
      return code ? { symbol: exchangeSymbol(`${code}.${suffix}`), name, security_type: securityTypeOf(code, name) } : null;
    }).filter(Boolean);
  }

  function parseTencentSearch(content) {
    return String(content || '').replace(/^"|";?$/g, '').split('^').map((item) => item.split('~')).filter((fields) => fields.length >= 3).map((fields) => {
      const code = digits(fields[1]);
      const name = String(fields[2] || code);
      const prefix = String(fields[0] || '').toUpperCase();
      return code ? { symbol: exchangeSymbol(`${code}.${/^(SH|SZ|BJ)$/.test(prefix) ? prefix : marketOf(code)}`), name, security_type: securityTypeOf(code, name) } : null;
    }).filter(Boolean);
  }

  function cleanupScript(script, variableName) {
    script?.remove();
    if (variableName) {
      try { delete root[variableName]; } catch { root[variableName] = undefined; }
    }
  }

  function loadJsonp(url, timeoutMs = REQUEST_TIMEOUT) {
    if (!root.document) return Promise.reject(new Error('当前环境不支持浏览器直连'));
    return new Promise((resolve, reject) => {
      const callbackName = `__astock_jsonp_${Date.now()}_${requestSequence += 1}`;
      const script = root.document.createElement('script');
      let settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanupScript(script, callbackName);
        if (error) reject(error); else resolve(value);
      };
      root[callbackName] = (payload) => finish(null, payload);
      script.async = true;
      script.src = `${url}${url.includes('?') ? '&' : '?'}cb=${callbackName}`;
      script.onerror = () => finish(new Error('东方财富浏览器直连失败'));
      const timer = setTimeout(() => finish(new Error('东方财富浏览器直连超时')), timeoutMs);
      root.document.head.appendChild(script);
    });
  }

  function loadVariableScript(url, variableName, options = {}) {
    if (!root.document) return Promise.reject(new Error('当前环境不支持浏览器直连'));
    return new Promise((resolve, reject) => {
      const script = root.document.createElement('script');
      let settled = false;
      cleanupScript(null, variableName);
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanupScript(script, variableName);
        if (error) reject(error); else resolve(value);
      };
      script.async = true;
      script.charset = options.charset || 'utf-8';
      if (options.referrerPolicy) script.referrerPolicy = options.referrerPolicy;
      script.src = url;
      script.onerror = () => finish(new Error(options.errorMessage || '腾讯浏览器直连失败'));
      script.onload = () => root.setTimeout(() => {
        const value = root[variableName];
        finish(value == null || value === '' ? new Error(options.errorMessage || '腾讯未返回数据') : null, value);
      }, 0);
      const timer = setTimeout(() => finish(new Error(options.timeoutMessage || '腾讯浏览器直连超时')), options.timeoutMs || REQUEST_TIMEOUT);
      root.document.head.appendChild(script);
    });
  }

  async function fetchEastmoneyQuote(symbol) {
    let lastError;
    for (const secid of eastmoneySecIds(symbol)) {
      try {
        const fields = 'f43,f44,f45,f46,f47,f48,f57,f58,f59,f60,f86,f170';
        return parseEastmoneyQuote(await loadJsonp(`https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=${fields}`), symbol);
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error('东方财富实时行情失败');
  }

  async function fetchEastmoneyHistory(symbol) {
    let lastError;
    for (const secid of eastmoneySecIds(symbol)) {
      try {
        const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=101&fqt=1&lmt=120&end=20500101`;
        return parseEastmoneyHistory(await loadJsonp(url), symbol);
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error('东方财富历史K线失败');
  }

  async function fetchTencentQuote(symbol) {
    const key = tencentKey(symbol);
    if (!key) throw new Error('腾讯证券代码无效');
    const content = await loadVariableScript(`https://qt.gtimg.cn/q=${key}`, `v_${key}`, { charset: 'gbk', errorMessage: '腾讯实时行情失败' });
    return parseTencentQuote(content, symbol);
  }

  async function fetchTencentHistory(symbol) {
    const key = tencentKey(symbol);
    if (!key) throw new Error('腾讯证券代码无效');
    const endpoints = [
      'https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get',
      'https://proxy.finance.qq.com/ifzqgtimg/appstock/app/fqkline/get',
      'https://ifzq.gtimg.cn/appstock/app/fqkline/get'
    ];
    let lastError;
    for (const endpoint of endpoints) {
      const variableName = `__astock_kline_${Date.now()}_${requestSequence += 1}`;
      const url = `${endpoint}?param=${key},day,,,120,qfq&_var=${variableName}`;
      try {
        const payload = await loadVariableScript(url, variableName, {
          errorMessage: '腾讯历史K线失败',
          referrerPolicy: 'no-referrer'
        });
        return parseTencentHistory(payload, symbol);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('腾讯历史K线失败');
  }

  function marketIsOpen(value = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(value instanceof Date ? value : new Date(value));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (values.weekday === 'Sat' || values.weekday === 'Sun') return false;
    const minutes = Number(values.hour) * 60 + Number(values.minute);
    return (minutes >= 570 && minutes <= 690) || (minutes >= 780 && minutes < 900);
  }

  function isFresh(record, now = new Date(), toleranceMs = 90000) {
    if (!record?.source_time) return false;
    if (!marketIsOpen(now)) return true;
    const source = new Date(record.source_time);
    return !Number.isNaN(source.getTime()) && Math.abs(now.getTime() - source.getTime()) <= toleranceMs;
  }

  function validQuote(record) {
    const quote = record?.quote || {};
    return ['price', 'previous_close', 'open', 'high', 'low', 'volume'].every((field) => Number.isFinite(finite(quote[field])))
      && quote.price > 0 && quote.previous_close > 0 && quote.open > 0 && quote.high >= quote.low && quote.low > 0 && quote.volume >= 0;
  }

  function priceDifference(left, right) {
    const first = finite(left?.quote?.price);
    const second = finite(right?.quote?.price);
    return first > 0 && second > 0 ? Math.abs(first - second) / Math.max(first, second) : Infinity;
  }

  async function settled(provider, operation) {
    try { return { ok: true, provider, value: await operation() }; }
    catch (error) { return { ok: false, provider, error }; }
  }

  async function fetchBestQuote(symbol, now = new Date()) {
    const [east, tencent] = await Promise.all([
      settled('eastmoney', () => fetchEastmoneyQuote(symbol)),
      settled('tencent', () => fetchTencentQuote(symbol))
    ]);
    const errors = [east, tencent].filter((result) => !result.ok).map((result) => ({ provider: result.provider, message: result.error?.message || '请求失败' }));
    const eastValid = east.ok && validQuote(east.value) && isFresh(east.value, now);
    const tencentValid = tencent.ok && validQuote(tencent.value) && isFresh(tencent.value, now);
    if (eastValid && tencentValid) {
      const difference = priceDifference(east.value, tencent.value);
      if (difference > 0.005) throw Object.assign(new Error(`两路最新价差异${(difference * 100).toFixed(2)}%，停止误判`), { errors });
      return { value: east.value, verification_source: 'tencent', fallback: false, errors };
    }
    if (eastValid) return { value: east.value, verification_source: null, fallback: false, errors };
    if (tencentValid) return { value: tencent.value, verification_source: null, fallback: true, errors };
    throw Object.assign(new Error('东方财富与腾讯实时行情均不可用'), { errors });
  }

  function historyPreviousClose(history, quoteTime) {
    const bars = history?.bars || [];
    if (!bars.length) return NaN;
    const last = bars.at(-1);
    return last.date === String(quoteTime || '').slice(0, 10) && bars.length > 1 ? bars.at(-2).close : last.close;
  }

  function historyMatchesQuote(history, quoteRecord, tolerance = 0.005) {
    const historyClose = finite(historyPreviousClose(history, quoteRecord?.source_time));
    const previousClose = finite(quoteRecord?.quote?.previous_close);
    return historyClose > 0 && previousClose > 0 && Math.abs(historyClose - previousClose) / Math.max(historyClose, previousClose) <= tolerance;
  }

  async function fetchBestHistory(symbol, quoteRecord) {
    const providers = [['tencent', fetchTencentHistory], ['eastmoney', fetchEastmoneyHistory]];
    const errors = [];
    for (const [provider, operation] of providers) {
      try {
        const value = await operation(symbol);
        if (historyMatchesQuote(value, quoteRecord)) return { value, fallback: provider !== 'tencent', errors };
        const historyClose = historyPreviousClose(value, quoteRecord.source_time);
        errors.push({ provider, message: `历史昨收${finite(historyClose).toFixed(4)}与实时昨收${finite(quoteRecord.quote?.previous_close).toFixed(4)}不一致` });
      } catch (error) {
        errors.push({ provider, message: error?.message || '历史K线失败' });
      }
    }
    throw Object.assign(new Error('两路历史K线均不可用或口径冲突'), { errors });
  }

  async function searchEastmoney(query) {
    const token = 'D43BF722C8E33BDC906FB84D85E326E8';
    const payload = await loadJsonp(`https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(query)}&type=14&token=${token}&count=10`);
    return parseEastmoneySuggestions(payload);
  }

  async function searchTencent(query) {
    const content = await loadVariableScript(`https://smartbox.gtimg.cn/s3/?q=${encodeURIComponent(query)}&t=all`, 'v_hint', { charset: 'gbk', errorMessage: '腾讯名称搜索失败' });
    return parseTencentSearch(content);
  }

  async function resolveSymbol(item) {
    const raw = typeof item === 'string' ? item : item?.symbol || item?.name || '';
    const code = digits(raw);
    if (code) return { symbol: exchangeSymbol(raw), name: '', security_type: securityTypeOf(code) };
    const query = String(raw).replace(/^NAME:/, '').trim();
    if (!query) throw new Error('请输入股票代码或名称');
    try {
      const matches = await searchEastmoney(query);
      if (matches.length) return matches[0];
    } catch {}
    const matches = await searchTencent(query);
    if (matches.length) return matches[0];
    throw new Error(`未找到“${query}”，请改用6位证券代码`);
  }

  function unavailableRecord(item, error, now = new Date()) {
    const raw = typeof item === 'string' ? item : item?.symbol || item?.name || '';
    const code = digits(raw);
    const name = String(raw).replace(/^NAME:/, '') || code || '未知标的';
    const upstreamDetails = (error?.errors || []).map((entry) => `${entry.provider || '上游'}：${entry.message || '请求失败'}`);
    return {
      symbol: code ? exchangeSymbol(raw) : String(raw),
      name,
      watch_key: String(raw),
      source: 'none',
      source_label: '浏览器直连失败',
      source_time: now.toISOString(),
      fetched_at: now.toISOString(),
      quote: {},
      daily_bars: [],
      data_quality: { valid: false, conflict: /差异|冲突/.test(error?.message || ''), stale: false, fallback: false, missing: [error?.message || '行情不可用', ...upstreamDetails], error_code: 'direct_market_failed', errors: error?.errors || [] }
    };
  }

  async function fetchInstrument(item, options = {}) {
    const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
    const raw = typeof item === 'string' ? item : item?.symbol || item?.name || '';
    try {
      const resolved = await resolveSymbol(raw);
      const quoteResult = await fetchBestQuote(resolved.symbol, now);
      const quoteRecord = quoteResult.value;
      const historyResult = await fetchBestHistory(resolved.symbol, quoteRecord);
      return {
        ...quoteRecord,
        name: options.name || resolved.name || quoteRecord.name,
        watch_key: options.watchKey || String(raw),
        fetched_at: now.toISOString(),
        verification_source: quoteResult.verification_source,
        history_source: historyResult.value.source,
        history_adjustment: historyResult.value.adjustment || 'unknown',
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
    } catch (error) {
      return unavailableRecord(raw, error, now);
    }
  }

  async function mapLimit(items, limit, operation) {
    const results = new Array(items.length);
    let cursor = 0;
    async function worker() {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await operation(items[index], index);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
  }

  async function fetchState(watchlist, options = {}) {
    const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
    const items = (Array.isArray(watchlist) ? watchlist : []).slice(0, 30);
    const [market, stocks] = await Promise.all([
      fetchInstrument('000001.SH', { now, name: '上证指数', watchKey: 'MARKET:000001.SH' }),
      mapLimit(items, 5, (item) => fetchInstrument(item, { now, watchKey: typeof item === 'string' ? item : item?.symbol || item?.name || '' }))
    ]);
    const connected = stocks.filter((stock) => stock.data_quality?.valid).length;
    const validMarket = Boolean(market.data_quality?.valid);
    const status = connected === stocks.length && validMarket ? 'connected' : connected > 0 ? 'partial' : items.length === 0 && validMarket ? 'connected' : 'disconnected';
    const realtimeSources = [...new Set([market, ...stocks]
      .filter((stock) => stock.data_quality?.valid)
      .map((stock) => stock.source_label || stock.source)
      .filter(Boolean))];
    return {
      version: '2.1.0-direct',
      generated_at: now.toISOString(),
      status,
      connected_count: connected,
      total_count: stocks.length,
      data_source: `浏览器直连：实时${realtimeSources.join(' / ') || '行情'} · 决策日K前复权（腾讯优先）`,
      monitor_mode: 'page_open_only',
      transport: 'direct',
      market,
      stocks
    };
  }

  return {
    finite,
    digits,
    marketOf,
    exchangeSymbol,
    eastmoneySecIds,
    tencentKey,
    securityTypeOf,
    parseEastmoneyQuote,
    parseEastmoneyHistory,
    parseTencentQuote,
    parseTencentHistory,
    parseEastmoneySuggestions,
    parseTencentSearch,
    marketIsOpen,
    isFresh,
    validQuote,
    priceDifference,
    historyPreviousClose,
    historyMatchesQuote,
    fetchInstrument,
    fetchState
  };
});
