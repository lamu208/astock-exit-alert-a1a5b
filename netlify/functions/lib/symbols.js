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

function tencentKey(value) {
  const code = digits(value);
  return code ? `${marketOf(value).toLowerCase()}${code}` : '';
}

function eastmoneySecIds(value) {
  const code = digits(value);
  if (!code) return [];
  if (marketOf(value) === 'SH') return [`1.${code}`, `0.${code}`];
  if (marketOf(value) === 'SZ') return [`0.${code}`, `1.${code}`];
  return [`0.${code}`];
}

function securityTypeOf(value, name = '') {
  if (resolveKnownIndex(value) || resolveKnownIndex(name) || /指数|成指|沪指|创业板指|科创50|北证50/i.test(name)) return 'INDEX';
  const code = digits(value);
  return /ETF|LOF|基金/i.test(name) || /^(15|16|50|51|52|56|58|59)\d{4}$/.test(code) ? 'ETF' : 'STOCK';
}

function normalizeWatchItem(item) {
  const rawSymbol = typeof item === 'string' ? item : String(item?.symbol || '');
  const rawName = typeof item === 'string' ? '' : String(item?.name || '');
  const index = resolveKnownIndex(rawSymbol) || resolveKnownIndex(rawName);
  if (index) {
    return {
      symbol: index.symbol,
      name: rawName || index.name,
      security_type: 'INDEX',
      is_index: true
    };
  }
  return { symbol: rawSymbol, name: rawName, security_type: securityTypeOf(rawSymbol, rawName), is_index: false };
}

module.exports = {
  INDEX_DEFINITIONS,
  digits,
  explicitMarket,
  marketOf,
  exchangeSymbol,
  tencentKey,
  eastmoneySecIds,
  resolveKnownIndex,
  securityTypeOf,
  normalizeWatchItem
};
