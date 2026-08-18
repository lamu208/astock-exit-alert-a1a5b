const { getText, getBuffer, UpstreamError } = require('./http');
const { digits, exchangeSymbol, tencentKey, securityTypeOf } = require('./symbols');

function finite(value, fallback = NaN) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function decodeGbk(buffer) {
  try {
    return new TextDecoder('gbk').decode(buffer);
  } catch {
    return new TextDecoder().decode(buffer);
  }
}

function parseSourceTime(value) {
  const match = String(value || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!match) return new Date().toISOString();
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+08:00`;
}

function parseQuote(raw, requestedSymbol = '') {
  const match = String(raw || '').match(/v_(?:sh|sz|bj)(\d{6})="([^"]*)"/i);
  if (!match) throw new UpstreamError('tencent_quote_invalid', '腾讯未返回有效实时报价');
  const values = match[2].split('~');
  const code = digits(values[2] || match[1] || requestedSymbol);
  const price = finite(values[3]);
  const previousClose = finite(values[4]);
  const open = finite(values[5]);
  const high = finite(values[33]);
  const low = finite(values[34]);
  if (!code || ![price, previousClose, open, high, low].every((value) => Number.isFinite(value) && value > 0)) {
    throw new UpstreamError('tencent_quote_invalid', '腾讯实时行情字段不完整');
  }
  const rawName = String(values[1] || code);
  const name = rawName.includes('�') ? code : rawName;
  return {
    symbol: exchangeSymbol(code),
    name,
    market: exchangeSymbol(code).split('.')[1],
    security_type: securityTypeOf(code, name),
    source: 'tencent',
    source_label: '腾讯',
    source_time: parseSourceTime(values[30]),
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

async function fetchQuote(symbol, options = {}) {
  const key = tencentKey(symbol);
  if (!key) throw new UpstreamError('tencent_symbol_invalid', '腾讯证券代码无效');
  const buffer = await getBuffer(`https://qt.gtimg.cn/q=${key}`, options);
  return parseQuote(decodeGbk(buffer), symbol);
}

function parseJsonAssignment(raw) {
  const text = String(raw || '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new UpstreamError('tencent_history_invalid', '腾讯未返回有效日K JSON');
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new UpstreamError('tencent_history_invalid', '腾讯日K JSON解析失败');
  }
}

function parseHistory(raw, symbol) {
  const payload = typeof raw === 'string' ? parseJsonAssignment(raw) : raw;
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
  })).filter((bar) => [bar.open, bar.close, bar.high, bar.low, bar.volume].every(Number.isFinite) && bar.close > 0);
  if (bars.length < 20) throw new UpstreamError('tencent_history_short', '腾讯历史K线不足20日', { count: bars.length });
  return { symbol: exchangeSymbol(symbol), source: 'tencent', source_label: '腾讯', adjustment: 'qfq', bars };
}

async function fetchHistory(symbol, options = {}) {
  const key = tencentKey(symbol);
  if (!key) throw new UpstreamError('tencent_symbol_invalid', '腾讯证券代码无效');
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${key},day,,,120,qfq`;
  return parseHistory(await getText(url, options), symbol);
}

function parseSearch(raw) {
  const content = String(raw || '').split('=').slice(1).join('=').replace(/^"|";?$/g, '');
  return content.split('^').map((item) => item.split('~')).filter((fields) => fields.length >= 3).map((fields) => {
    const code = digits(fields[1]);
    const name = String(fields[2] || code);
    return code ? { symbol: exchangeSymbol(code), name, security_type: securityTypeOf(code, name) } : null;
  }).filter(Boolean);
}

async function search(query, options = {}) {
  const buffer = await getBuffer(`https://smartbox.gtimg.cn/s3/?q=${encodeURIComponent(query)}&t=all`, options);
  return parseSearch(decodeGbk(buffer));
}

module.exports = { decodeGbk, parseSourceTime, parseQuote, parseJsonAssignment, parseHistory, parseSearch, fetchQuote, fetchHistory, search };
