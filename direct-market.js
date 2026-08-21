(function directMarketModule(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DirectMarket = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDirectMarket(root) {
  const REQUEST_TIMEOUT = 6500;
  const FUYAO_BASE_URL = 'https://fuyao.aicubes.cn';
  let requestSequence = 0;

  function finite(value, fallback = NaN) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function digits(value) {
    const match = String(value || '').match(/\d{6}/);
    return match ? match[0] : '';
  }

  const INDEX_DEFINITIONS = Object.freeze([
    { symbol: '000001.SH', name: '上证指数', aliases: ['上证指数', '上证综指', '沪指', '999999', '999999.SH', 'SH999999'] },
    { symbol: '399001.SZ', name: '深证成指', aliases: ['深证成指', '深成指'] },
    { symbol: '399006.SZ', name: '创业板指', aliases: ['创业板指', '创业板指数'] },
    { symbol: '000300.SH', name: '沪深300', aliases: ['沪深300', '沪深300指数'] },
    { symbol: '000016.SH', name: '上证50', aliases: ['上证50', '上证50指数'] },
    { symbol: '000905.SH', name: '中证500', aliases: ['中证500', '中证500指数'] },
    { symbol: '000688.SH', name: '科创50', aliases: ['科创50', '科创50指数'] },
    { symbol: '000852.SH', name: '中证1000', aliases: ['中证1000', '中证1000指数'] },
    { symbol: '899050.BJ', name: '北证50', aliases: ['北证50', '北证50指数'] }
  ]);

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

  function normalizeIndexKey(value) {
    return String(value || '').trim().replace(/^INDEX:/i, '').replace(/\s+/g, '').toUpperCase();
  }

  function resolveKnownIndex(value) {
    const original = String(value || '').trim();
    if (!original) return null;
    const key = normalizeIndexKey(original);
    const code = digits(key);
    const definition = INDEX_DEFINITIONS.find((item) => (
      item.symbol === key
      || item.aliases.some((alias) => normalizeIndexKey(alias) === key)
      || (code && code !== '000001' && !explicitMarket(key) && digits(item.symbol) === code)
      || (/^INDEX:/i.test(original) && code && digits(item.symbol) === code)
    ));
    if (definition) return { ...definition, security_type: 'INDEX', is_index: true };
    if (/^INDEX:/i.test(original) && code && explicitMarket(key)) {
      return { symbol: `${code}.${explicitMarket(key)}`, name: `${code}指数`, aliases: [], security_type: 'INDEX', is_index: true };
    }
    return null;
  }

  function securityTypeOf(value, name = '') {
    if (resolveKnownIndex(value) || resolveKnownIndex(name) || /指数|成指|沪指|创业板指|科创50|北证50/i.test(name)) return 'INDEX';
    const code = digits(value);
    return /ETF|LOF|基金/i.test(name) || /^(15|16|50|51|52|56|58|59)\d{4}$/.test(code) ? 'ETF' : 'STOCK';
  }

  function assetFamily(symbol, options = {}) {
    if (options.isIndex || options.securityType === 'INDEX') return 'index';
    return (options.securityType || securityTypeOf(symbol, options.name)) === 'ETF' ? 'fund' : 'stock';
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
      source_label: '腾讯直连',
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

  function shanghaiDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function parseFuyaoQuote(data, symbol, options = {}) {
    const item = Array.isArray(data?.item) ? data.item[0] : null;
    const normalizedSymbol = exchangeSymbol(item?.thscode || symbol);
    const code = digits(normalizedSymbol);
    const price = finite(item?.last_price);
    const previousClose = finite(item?.prev_price);
    const open = finite(item?.open_price);
    const high = finite(item?.high_price);
    const low = finite(item?.low_price);
    if (!code || ![price, previousClose, open, high, low].every((value) => Number.isFinite(value) && value > 0)) {
      throw new Error('同花顺实时行情字段不完整');
    }
    const name = String(options.name || item?.name || code);
    return {
      symbol: normalizedSymbol,
      name,
      market: marketOf(normalizedSymbol),
      security_type: options.isIndex ? 'INDEX' : securityTypeOf(normalizedSymbol, name),
      source: 'fuyao',
      source_label: '同花顺国内直连',
      source_time: sourceTime(data?.timestamp || options.now),
      quote: {
        price,
        previous_close: previousClose,
        open,
        high,
        low,
        volume: finite(item?.volume, 0),
        amount: finite(item?.turnover, 0),
        change_pct: finite(item?.price_change_ratio_pct, 0) / 100
      }
    };
  }

  function parseFuyaoHistory(data, symbol, options = {}) {
    const rows = Array.isArray(data?.item) ? data.item : [];
    const bars = rows.map((item) => ({
      date: shanghaiDate(finite(item?.date_ms)),
      open: finite(item?.open_price),
      close: finite(item?.close_price),
      high: finite(item?.high_price),
      low: finite(item?.low_price),
      volume: finite(item?.volume),
      amount: finite(item?.turnover, 0)
    })).filter((bar) => bar.date && validBar(bar)).sort((left, right) => left.date.localeCompare(right.date));
    if (bars.length < 20) throw new Error('同花顺历史K线不足20日');
    return {
      symbol: exchangeSymbol(symbol),
      name: options.name || digits(symbol),
      source: 'fuyao',
      source_label: '同花顺国内直连日K',
      adjustment: data?.adjust === 'forward' ? 'qfq' : 'none',
      bars
    };
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

  async function fetchJson(url, options = {}) {
    if (typeof root.fetch !== 'function') throw new Error('当前环境不支持同花顺直连');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT);
    try {
      const response = await root.fetch(url, {
        method: 'GET',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        headers: options.headers || {},
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`同花顺 HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function requestFuyao(path, params, options = {}) {
    const key = String(options.fuyaoApiKey || '').trim();
    if (!key) throw new Error('同花顺 API Key 未设置');
    const query = new URLSearchParams(params).toString();
    const payload = await fetchJson(`${FUYAO_BASE_URL}${path}?${query}`, {
      headers: { accept: 'application/json', 'X-api-key': key }
    });
    if (finite(payload?.code, NaN) !== 0) throw new Error(payload?.message || '同花顺接口返回错误');
    return payload?.data || {};
  }

  async function fetchFuyaoQuote(symbol, options = {}) {
    const thscode = exchangeSymbol(symbol);
    const family = assetFamily(thscode, options);
    const endpoint = family === 'index'
      ? '/api/a-share-index/prices/snapshot'
      : family === 'fund'
        ? '/api/fund/market/snapshot'
        : '/api/a-share/prices/snapshot';
    const params = family === 'fund' ? { thscode } : { thscodes: thscode };
    const data = await requestFuyao(endpoint, params, options);
    return parseFuyaoQuote(data, thscode, options);
  }

  async function fetchFuyaoHistory(symbol, options = {}) {
    const thscode = exchangeSymbol(symbol);
    const family = assetFamily(thscode, options);
    const endpoint = family === 'index'
      ? '/api/a-share-index/prices/historical'
      : family === 'fund'
        ? '/api/fund/market/historical'
        : '/api/a-share/prices/historical';
    const end = options.now instanceof Date ? options.now.getTime() : new Date(options.now || Date.now()).getTime();
    const params = {
      thscode,
      interval: '1d',
      start: String(end - 400 * 24 * 60 * 60 * 1000),
      end: String(end)
    };
    if (family === 'stock') {
      params.adjust = 'forward';
      params.offset = '0';
    }
    const data = await requestFuyao(endpoint, params, options);
    return parseFuyaoHistory(data, thscode, options);
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

  async function fetchBestQuote(symbol, now = new Date(), options = {}) {
    const fuyaoKey = String(options.fuyaoApiKey || '').trim();
    const results = await Promise.all([
      ...(fuyaoKey ? [settled('fuyao', () => fetchFuyaoQuote(symbol, { ...options, now }))] : []),
      settled('eastmoney', () => fetchEastmoneyQuote(symbol)),
      settled('tencent', () => fetchTencentQuote(symbol))
    ]);
    const fuyao = results.find((result) => result.provider === 'fuyao');
    const east = results.find((result) => result.provider === 'eastmoney');
    const tencent = results.find((result) => result.provider === 'tencent');
    const errors = results.filter((result) => !result.ok).map((result) => ({ provider: result.provider, message: result.error?.message || '请求失败' }));
    const fuyaoValid = fuyao?.ok && validQuote(fuyao.value) && isFresh(fuyao.value, now);
    const eastValid = east.ok && validQuote(east.value) && isFresh(east.value, now);
    const tencentValid = tencent.ok && validQuote(tencent.value) && isFresh(tencent.value, now);
    if (fuyaoValid) {
      const verifier = tencentValid ? tencent : eastValid ? east : null;
      if (verifier) {
        const difference = priceDifference(fuyao.value, verifier.value);
        if (difference > 0.005) throw Object.assign(new Error(`同花顺与${verifier.provider === 'tencent' ? '腾讯' : '东方财富'}最新价差异${(difference * 100).toFixed(2)}%，停止误判`), { errors });
        if ((!fuyao.value.name || fuyao.value.name === digits(symbol)) && verifier.value.name) fuyao.value.name = verifier.value.name;
      }
      return { value: fuyao.value, verification_source: verifier?.provider || null, fallback: false, errors };
    }
    const fallback = Boolean(fuyaoKey);
    if (eastValid && tencentValid) {
      const difference = priceDifference(east.value, tencent.value);
      if (difference > 0.005) throw Object.assign(new Error(`两路最新价差异${(difference * 100).toFixed(2)}%，停止误判`), { errors });
      return { value: tencent.value, verification_source: 'eastmoney', fallback, errors };
    }
    if (tencentValid) return { value: tencent.value, verification_source: null, fallback, errors };
    if (eastValid) return { value: east.value, verification_source: null, fallback: true, errors };
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

  function adjustedHistoryCanAlign(history) {
    return ['qfq', 'forward'].includes(String(history?.adjustment || '').toLowerCase());
  }

  function historiesSharePriceBasis(left, right, quoteTime, tolerance = 0.005) {
    const leftClose = finite(historyPreviousClose(left, quoteTime));
    const rightClose = finite(historyPreviousClose(right, quoteTime));
    return leftClose > 0 && rightClose > 0
      && Math.abs(leftClose - rightClose) / Math.max(leftClose, rightClose) <= tolerance;
  }

  function alignAdjustedHistoryToQuote(history, quoteRecord, maxDifference = 0.2) {
    if (!adjustedHistoryCanAlign(history)) return null;
    const historyClose = finite(historyPreviousClose(history, quoteRecord?.source_time));
    const previousClose = finite(quoteRecord?.quote?.previous_close);
    if (!(historyClose > 0 && previousClose > 0)) return null;
    const difference = Math.abs(historyClose - previousClose) / Math.max(historyClose, previousClose);
    if (difference <= 0.005 || difference > maxDifference) return null;
    const ratio = previousClose / historyClose;
    const bars = (history.bars || []).map((bar) => ({
      ...bar,
      open: bar.open * ratio,
      close: bar.close * ratio,
      high: bar.high * ratio,
      low: bar.low * ratio
    }));
    if (!bars.length || !bars.every(validBar)) return null;
    return {
      ...history,
      bars,
      alignment: 'quote_previous_close',
      alignment_ratio: ratio,
      alignment_from_previous_close: historyClose,
      alignment_to_previous_close: previousClose
    };
  }

  async function fetchBestHistory(symbol, quoteRecord, options = {}) {
    const fuyaoKey = String(options.fuyaoApiKey || '').trim();
    const providers = fuyaoKey
      ? [['fuyao', (value) => fetchFuyaoHistory(value, { ...options, securityType: quoteRecord.security_type })], ['tencent', fetchTencentHistory], ['eastmoney', fetchEastmoneyHistory]]
      : [['tencent', fetchTencentHistory], ['eastmoney', fetchEastmoneyHistory]];
    const errors = [];
    const candidates = [];
    for (const [provider, operation] of providers) {
      try {
        const value = await operation(symbol);
        if (historyMatchesQuote(value, quoteRecord)) return { value, fallback: provider !== 'tencent', errors };
        candidates.push({ provider, value });
        const historyClose = historyPreviousClose(value, quoteRecord.source_time);
        errors.push({ provider, message: `历史昨收${finite(historyClose).toFixed(4)}与实时昨收${finite(quoteRecord.quote?.previous_close).toFixed(4)}不一致` });
      } catch (error) {
        errors.push({ provider, message: error?.message || '历史K线失败' });
      }
    }
    for (const candidate of candidates) {
      const verifier = candidates.find((item) => (
        item !== candidate
        && adjustedHistoryCanAlign(item.value)
        && historiesSharePriceBasis(candidate.value, item.value, quoteRecord.source_time)
      ));
      if (!verifier) continue;
      const aligned = alignAdjustedHistoryToQuote(candidate.value, quoteRecord);
      if (aligned && historyMatchesQuote(aligned, quoteRecord)) {
        return {
          value: aligned,
          fallback: candidate.provider !== 'tencent',
          errors,
          alignment_verified_by: verifier.provider
        };
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
    const knownIndex = resolveKnownIndex(raw);
    if (knownIndex) return knownIndex;
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
    const knownIndex = resolveKnownIndex(raw);
    const code = digits(raw);
    const name = knownIndex?.name || String(raw).replace(/^(?:NAME|INDEX):/i, '') || code || '未知标的';
    const upstreamDetails = (error?.errors || []).map((entry) => `${entry.provider || '上游'}：${entry.message || '请求失败'}`);
    return {
      symbol: knownIndex?.symbol || (code ? exchangeSymbol(raw) : String(raw)),
      name,
      security_type: knownIndex ? 'INDEX' : securityTypeOf(raw, name),
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
      const instrumentOptions = {
        ...options,
        name: options.name || resolved.name,
        securityType: options.securityType || resolved.security_type,
        isIndex: Boolean(options.isIndex || resolved.is_index || resolved.security_type === 'INDEX')
      };
      const quoteResult = await fetchBestQuote(resolved.symbol, now, instrumentOptions);
      const quoteRecord = quoteResult.value;
      const historyResult = await fetchBestHistory(resolved.symbol, quoteRecord, instrumentOptions);
      return {
        ...quoteRecord,
        symbol: resolved.symbol,
        name: instrumentOptions.name || quoteRecord.name,
        security_type: instrumentOptions.isIndex ? 'INDEX' : (quoteRecord.security_type || resolved.security_type),
        watch_key: options.watchKey || String(raw),
        fetched_at: now.toISOString(),
        verification_source: quoteResult.verification_source,
        history_source: historyResult.value.source,
        history_adjustment: historyResult.value.adjustment || 'unknown',
        history_alignment: historyResult.value.alignment || null,
        history_alignment_ratio: finite(historyResult.value.alignment_ratio, null),
        history_alignment_verified_by: historyResult.alignment_verified_by || null,
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
      fetchInstrument('000001.SH', { ...options, now, name: '上证指数', isIndex: true, securityType: 'INDEX', watchKey: 'MARKET:000001.SH' }),
      mapLimit(items, 5, (item) => fetchInstrument(item, { ...options, now, watchKey: typeof item === 'string' ? item : item?.symbol || item?.name || '' }))
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
      data_source: `浏览器直连：实时${realtimeSources.join(' / ') || '行情'} · 日K按同一优先链自动校验`,
      monitor_mode: 'page_open_only',
      transport: 'direct',
      market,
      stocks
    };
  }

  return {
    INDEX_DEFINITIONS,
    finite,
    digits,
    marketOf,
    exchangeSymbol,
    eastmoneySecIds,
    tencentKey,
    resolveKnownIndex,
    securityTypeOf,
    parseEastmoneyQuote,
    parseEastmoneyHistory,
    parseTencentQuote,
    parseTencentHistory,
    parseFuyaoQuote,
    parseFuyaoHistory,
    parseEastmoneySuggestions,
    parseTencentSearch,
    marketIsOpen,
    isFresh,
    validQuote,
    priceDifference,
    historyPreviousClose,
    historyMatchesQuote,
    adjustedHistoryCanAlign,
    historiesSharePriceBasis,
    alignAdjustedHistoryToQuote,
    fetchInstrument,
    fetchState
  };
});

