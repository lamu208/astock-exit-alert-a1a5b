const { getJson, UpstreamError } = require('./http');
const { digits, exchangeSymbol, securityTypeOf } = require('./symbols');

const BASE_URL = 'https://fuyao.aicubes.cn';

function finite(value, fallback = NaN) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function apiKey(options = {}) {
  return String(
    options.apiKey
    || process.env.HITHINK_FINANCE_API_KEY
    || process.env.FUYAO_API_KEY
    || ''
  ).trim();
}

function assetFamily(symbol, options = {}) {
  if (options.isIndex) return 'index';
  const securityType = options.securityType || securityTypeOf(symbol, options.name);
  return securityType === 'ETF' ? 'fund' : 'stock';
}

function sourceTime(value, fallback = new Date()) {
  const timestamp = finite(value, NaN);
  if (Number.isFinite(timestamp) && timestamp > 0) return new Date(timestamp).toISOString();
  const date = fallback instanceof Date ? fallback : new Date(fallback || Date.now());
  return date.toISOString();
}

function shanghaiDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function requestApi(path, params, options = {}) {
  const key = apiKey(options);
  if (!key) throw new UpstreamError('fuyao_key_missing', '扶摇 API Key 未配置');
  const query = new URLSearchParams(params).toString();
  const payload = await getJson(`${BASE_URL}${path}?${query}`, {
    ...options,
    headers: { ...(options.headers || {}), 'X-api-key': key }
  });
  if (finite(payload?.code, NaN) !== 0) {
    throw new UpstreamError('fuyao_business_error', payload?.message || '扶摇接口返回业务错误', {
      upstreamCode: payload?.code,
      requestId: payload?.request_id
    });
  }
  return payload?.data || {};
}

function quoteEndpoint(family) {
  if (family === 'index') return '/api/a-share-index/prices/snapshot';
  if (family === 'fund') return '/api/fund/market/snapshot';
  return '/api/a-share/prices/snapshot';
}

function historyEndpoint(family) {
  if (family === 'index') return '/api/a-share-index/prices/historical';
  if (family === 'fund') return '/api/fund/market/historical';
  return '/api/a-share/prices/historical';
}

function parseQuote(data, symbol, options = {}) {
  const item = Array.isArray(data?.item) ? data.item[0] : null;
  const code = digits(item?.thscode || item?.ticker || symbol);
  if (!code) throw new UpstreamError('fuyao_quote_invalid', '扶摇未返回证券代码');
  const price = finite(item.last_price);
  const previousClose = finite(item.prev_price);
  const open = finite(item.open_price);
  const high = finite(item.high_price);
  const low = finite(item.low_price);
  if (![price, previousClose, open, high, low].every((value) => Number.isFinite(value) && value > 0)) {
    throw new UpstreamError('fuyao_quote_invalid', '扶摇实时行情字段不完整');
  }
  const name = String(options.name || code);
  return {
    symbol: exchangeSymbol(code),
    name,
    market: exchangeSymbol(code).split('.')[1],
    security_type: options.isIndex ? 'INDEX' : securityTypeOf(code, name),
    source: 'fuyao',
    source_label: '扶摇同花顺',
    source_time: sourceTime(data?.timestamp, options.now),
    quote: {
      price,
      previous_close: previousClose,
      open,
      high,
      low,
      volume: finite(item.volume, 0),
      amount: finite(item.turnover, 0),
      change_pct: finite(item.price_change_ratio_pct, 0) / 100
    }
  };
}

async function fetchQuote(symbol, options = {}) {
  const thscode = exchangeSymbol(symbol);
  if (!thscode) throw new UpstreamError('fuyao_symbol_invalid', '扶摇证券代码无效');
  const family = assetFamily(thscode, options);
  const parameter = family === 'fund' ? { thscode } : { thscodes: thscode };
  const data = await requestApi(quoteEndpoint(family), parameter, options);
  return parseQuote(data, thscode, options);
}

function parseHistory(data, symbol, options = {}) {
  const rows = Array.isArray(data?.item) ? data.item : [];
  const bars = rows.map((item) => ({
    date: shanghaiDate(finite(item.date_ms)),
    open: finite(item.open_price),
    close: finite(item.close_price),
    high: finite(item.high_price),
    low: finite(item.low_price),
    volume: finite(item.volume),
    amount: finite(item.turnover, 0)
  })).filter((bar) => bar.date && [bar.open, bar.close, bar.high, bar.low, bar.volume].every(Number.isFinite) && bar.close > 0)
    .sort((left, right) => left.date.localeCompare(right.date));
  if (bars.length < 20) throw new UpstreamError('fuyao_history_short', '扶摇历史K线不足20日', { count: bars.length });
  return {
    symbol: exchangeSymbol(symbol),
    name: options.name || digits(symbol),
    source: 'fuyao',
    source_label: '扶摇同花顺',
    bars
  };
}

async function fetchHistory(symbol, options = {}) {
  const thscode = exchangeSymbol(symbol);
  if (!thscode) throw new UpstreamError('fuyao_symbol_invalid', '扶摇证券代码无效');
  const family = assetFamily(thscode, options);
  const end = options.now instanceof Date ? options.now.getTime() : new Date(options.now || Date.now()).getTime();
  const start = end - 400 * 24 * 60 * 60 * 1000;
  const params = { thscode, interval: '1d', start: String(start), end: String(end) };
  if (family === 'stock') {
    params.adjust = 'forward';
    params.offset = '0';
  }
  const data = await requestApi(historyEndpoint(family), params, options);
  return parseHistory(data, thscode, options);
}

function parseSearch(data) {
  const rows = Array.isArray(data?.item) ? data.item : [];
  return rows.map((item) => {
    const code = digits(item.thscode || item.ticker);
    const name = String(item.name || code);
    if (!code) return null;
    return {
      symbol: exchangeSymbol(code),
      name,
      security_type: String(item.asset_type || '').startsWith('fund-') ? 'ETF' : securityTypeOf(code, name)
    };
  }).filter(Boolean);
}

async function search(query, options = {}) {
  const data = await requestApi('/api/meta/tickers/search', {
    q: String(query || '').trim(),
    asset_type: 'a-share,fund-etf,fund-lof',
    limit: '10'
  }, options);
  return parseSearch(data);
}

module.exports = {
  apiKey,
  assetFamily,
  sourceTime,
  shanghaiDate,
  parseQuote,
  parseHistory,
  parseSearch,
  fetchQuote,
  fetchHistory,
  search
};
