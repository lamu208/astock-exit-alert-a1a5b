function digits(value) {
  const match = String(value || '').match(/\d{6}/);
  return match ? match[0] : '';
}

function marketOf(value) {
  const code = digits(value);
  if (code.startsWith('4') || code.startsWith('8')) return 'BJ';
  if (code.startsWith('5') || code.startsWith('6') || code.startsWith('9')) return 'SH';
  return 'SZ';
}

function exchangeSymbol(value) {
  const code = digits(value);
  return code ? `${code}.${marketOf(code)}` : '';
}

function tencentKey(value) {
  const code = digits(value);
  return code ? `${marketOf(code).toLowerCase()}${code}` : '';
}

function eastmoneySecIds(value) {
  const code = digits(value);
  if (!code) return [];
  if (marketOf(code) === 'SH') return [`1.${code}`, `0.${code}`];
  if (marketOf(code) === 'SZ') return [`0.${code}`, `1.${code}`];
  return [`0.${code}`];
}

function securityTypeOf(value, name = '') {
  const code = digits(value);
  return /ETF|LOF|基金/i.test(name) || /^(15|16|50|51|52|56|58|59)\d{4}$/.test(code) ? 'ETF' : 'STOCK';
}

function normalizeWatchItem(item) {
  if (typeof item === 'string') return { symbol: item, name: '' };
  return { symbol: String(item?.symbol || ''), name: String(item?.name || '') };
}

module.exports = { digits, marketOf, exchangeSymbol, tencentKey, eastmoneySecIds, securityTypeOf, normalizeWatchItem };
