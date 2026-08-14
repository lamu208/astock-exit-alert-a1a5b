const { getJson, UpstreamError } = require('./http');
const { digits, exchangeSymbol, eastmoneySecIds, securityTypeOf } = require('./symbols');

function finite(value, fallback = NaN) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function decimalDivisor(data) {
  const decimals = finite(data?.f59, NaN);
  return Number.isFinite(decimals) && decimals >= 0 && decimals <= 6 ? 10 ** decimals : 100;
}

function sourceTime(value) {
  const timestamp = finite(value, NaN);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return new Date().toISOString();
  const milliseconds = timestamp > 1000000000000 ? timestamp : timestamp * 1000;
  return new Date(milliseconds).toISOString();
}

function parseQuote(payload) {
  const data = payload?.data;
  const code = digits(data?.f57);
  if (!code) throw new UpstreamError('eastmoney_quote_invalid', '东方财富未返回证券代码');
  const divisor = decimalDivisor(data);
  const price = finite(data.f43) / divisor;
  const previousClose = finite(data.f60) / divisor;
  const open = finite(data.f46) / divisor;
  const high = finite(data.f44) / divisor;
  const low = finite(data.f45) / divisor;
  if (![price, previousClose, open, high, low].every((value) => Number.isFinite(value) && value > 0)) {
    throw new UpstreamError('eastmoney_quote_invalid', '东方财富实时行情字段不完整');
  }
  const name = String(data.f58 || code);
  return {
    symbol: exchangeSymbol(code),
    name,
    market: exchangeSymbol(code).split('.')[1],
    security_type: securityTypeOf(code, name),
    source: 'eastmoney',
    source_label: '东方财富',
    source_time: sourceTime(data.f86),
    quote: {
      price,
      previous_close: previousClose,
      open,
      high,
      low,
      volume: finite(data.f47, 0),
      amount: finite(data.f48, 0),
      change_pct: finite(data.f170, 0) / 100
    }
  };
}

async function fetchQuote(symbol, options = {}) {
  let lastError;
  for (const secid of eastmoneySecIds(symbol)) {
    try {
      const fields = 'f43,f44,f45,f46,f47,f48,f57,f58,f59,f60,f86,f170';
      const payload = await getJson(`https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=${fields}`, options);
      return parseQuote(payload);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new UpstreamError('eastmoney_quote_failed', '东方财富实时行情失败');
}

function parseHistory(payload, symbol, name = '') {
  const lines = payload?.data?.klines;
  if (!Array.isArray(lines)) throw new UpstreamError('eastmoney_history_invalid', '东方财富未返回日K数据');
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
  }).filter((bar) => [bar.open, bar.close, bar.high, bar.low, bar.volume].every(Number.isFinite) && bar.close > 0);
  if (bars.length < 20) throw new UpstreamError('eastmoney_history_short', '东方财富历史K线不足20日', { count: bars.length });
  return {
    symbol: exchangeSymbol(symbol),
    name: payload?.data?.name || name || digits(symbol),
    source: 'eastmoney',
    source_label: '东方财富',
    bars
  };
}

async function fetchHistory(symbol, options = {}) {
  let lastError;
  for (const secid of eastmoneySecIds(symbol)) {
    try {
      const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=101&fqt=0&lmt=120&end=20500101`;
      const payload = await getJson(url, options);
      return parseHistory(payload, symbol);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new UpstreamError('eastmoney_history_failed', '东方财富历史K线失败');
}

function parseSuggestions(payload) {
  const rows = payload?.QuotationCodeTable?.Data || payload?.QuotationCodeTable?.data || payload?.data || [];
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const code = digits(row.Code || row.code || row.SecurityCode || row.securityCode);
    const name = String(row.Name || row.name || row.SecurityName || row.securityName || '');
    return code ? { symbol: exchangeSymbol(code), name, security_type: securityTypeOf(code, name) } : null;
  }).filter(Boolean);
}

async function search(query, options = {}) {
  const token = 'D43BF722C8E33BDC906FB84D85E326E8';
  const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(query)}&type=14&token=${token}&count=10`;
  return parseSuggestions(await getJson(url, options));
}

module.exports = { parseQuote, parseHistory, parseSuggestions, fetchQuote, fetchHistory, search };
