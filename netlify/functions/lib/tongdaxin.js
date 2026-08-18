const { UpstreamError } = require('./http');
const { digits, exchangeSymbol, marketOf, securityTypeOf } = require('./symbols');

function finite(value, fallback = NaN) {
  try {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function fullCode(value) {
  const code = digits(value);
  return code ? `${marketOf(code).toLowerCase()}${code}` : '';
}

function priceToYuan(value, converter) {
  if (typeof converter === 'function') return finite(converter(value));
  return finite(value) / 1000;
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

function loadLibrary(options = {}) {
  if (options.library) return options.library;
  try {
    return require('node-tdx-market');
  } catch (error) {
    throw new UpstreamError('tongdaxin_dependency_missing', '通达信客户端依赖未安装', { message: error?.message });
  }
}

function timeout(operation, timeoutMs, label) {
  let timer;
  return Promise.race([
    operation,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new UpstreamError('tongdaxin_timeout', `${label}超时`)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

async function withClient(options, operation) {
  const library = loadLibrary(options);
  const client = options.clientFactory
    ? options.clientFactory(library)
    : new library.TdxClient({ autoReconnect: false });
  if (typeof client.on === 'function') client.on('error', () => {});
  const timeoutMs = Math.min(Number(options.timeoutMs) || 3500, 5000);
  try {
    await timeout(Promise.resolve(client.connect()), timeoutMs, '通达信连接');
    return await timeout(Promise.resolve(operation(client, library)), timeoutMs, '通达信取数');
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    throw new UpstreamError('tongdaxin_failed', error?.message || '通达信行情失败');
  } finally {
    try { client.disconnect?.(); } catch {}
    try { client.destroy?.(); } catch {}
  }
}

function parseQuote(payload, symbol, options = {}, converter) {
  const record = Array.isArray(payload) ? payload[0] : payload;
  const code = digits(record?.code || symbol);
  if (!code) throw new UpstreamError('tongdaxin_quote_invalid', '通达信未返回证券代码');
  const price = priceToYuan(record.price, converter);
  const previousClose = priceToYuan(record.lastClose ?? record.preClose, converter);
  const open = priceToYuan(record.open, converter);
  const high = priceToYuan(record.high, converter);
  const low = priceToYuan(record.low, converter);
  if (![price, previousClose, open, high, low].every((value) => Number.isFinite(value) && value > 0)) {
    throw new UpstreamError('tongdaxin_quote_invalid', '通达信实时行情字段不完整');
  }
  const name = String(options.name || code);
  return {
    symbol: exchangeSymbol(code),
    name,
    market: marketOf(code),
    security_type: options.isIndex ? 'INDEX' : securityTypeOf(code, name),
    source: 'tongdaxin',
    source_label: '通达信',
    source_time: new Date(options.now || Date.now()).toISOString(),
    quote: {
      price,
      previous_close: previousClose,
      open,
      high,
      low,
      volume: finite(record.volume, 0),
      amount: finite(record.amount, 0),
      change_pct: previousClose > 0 ? (price - previousClose) / previousClose : 0
    }
  };
}

async function fetchQuote(symbol, options = {}) {
  const code = fullCode(symbol);
  if (!code) throw new UpstreamError('tongdaxin_symbol_invalid', '通达信证券代码无效');
  return withClient(options, async (client, library) => {
    const payload = await client.getQuote([code]);
    return parseQuote(payload, symbol, options, library.priceToYuan);
  });
}

function parseHistory(payload, symbol, options = {}, converter) {
  const rows = Array.isArray(payload?.bars) ? payload.bars : Array.isArray(payload) ? payload : [];
  const bars = rows.map((item) => ({
    date: shanghaiDate(item.time || item.datetime),
    open: priceToYuan(item.open, converter),
    close: priceToYuan(item.close, converter),
    high: priceToYuan(item.high, converter),
    low: priceToYuan(item.low, converter),
    volume: finite(item.volume, 0),
    amount: finite(item.amount, 0)
  })).filter((bar) => bar.date && [bar.open, bar.close, bar.high, bar.low, bar.volume].every(Number.isFinite) && bar.close > 0)
    .sort((left, right) => left.date.localeCompare(right.date));
  if (bars.length < 20) throw new UpstreamError('tongdaxin_history_short', '通达信历史K线不足20日', { count: bars.length });
  return {
    symbol: exchangeSymbol(symbol),
    name: options.name || digits(symbol),
    source: 'tongdaxin',
    source_label: '通达信',
    bars
  };
}

async function fetchHistory(symbol, options = {}) {
  const code = fullCode(symbol);
  if (!code) throw new UpstreamError('tongdaxin_symbol_invalid', '通达信证券代码无效');
  return withClient(options, async (client, library) => {
    const payload = await client.getKline({
      code,
      category: library.KlineCategory.Day,
      start: 0,
      count: 160
    });
    return parseHistory(payload, symbol, options, library.priceToYuan);
  });
}

module.exports = {
  finite,
  fullCode,
  priceToYuan,
  shanghaiDate,
  parseQuote,
  parseHistory,
  fetchQuote,
  fetchHistory
};
