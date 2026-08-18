const gateway = require('./lib/market-gateway');

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, max-age=0',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,OPTIONS',
  'access-control-allow-headers': 'Content-Type'
};

function response(statusCode, body) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

function parseWatchlist(raw) {
  if (!raw) return [];
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('watchlist 参数不是有效 JSON');
  }
  if (!Array.isArray(value)) throw new Error('watchlist 参数必须是数组');
  return value.slice(0, 30);
}

function usedSources(stocks, market) {
  const sources = new Set();
  for (const item of [market, ...(stocks || [])]) {
    if (item?.source && item.source !== 'none') sources.add(item.source_label || item.source);
    if (item?.history_source) {
      const adjustment = item.history_adjustment === 'qfq' ? '前复权' : '备用口径';
      sources.add(`${item.history_source}日K（${adjustment}）`);
    }
  }
  return [...sources];
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: JSON_HEADERS, body: '' };
  if (event.httpMethod !== 'GET') return response(405, { error: '只支持 GET 请求' });

  let watchlist;
  try {
    watchlist = parseWatchlist(event.queryStringParameters?.watchlist || '[]');
  } catch (error) {
    return response(400, { error: error.message });
  }

  const requestTime = new Date();
  try {
    const [stocks, market] = await Promise.all([
      gateway.fetchWatchlist(watchlist, { now: requestTime }),
      gateway.fetchMarketData('000001.SH', { now: requestTime, name: '上证指数', isIndex: true })
    ]);
    const connected = stocks.filter((stock) => stock.data_quality?.valid).length;
    const status = connected === stocks.length && market.data_quality?.valid
      ? 'connected'
      : connected > 0
        ? 'partial'
        : stocks.length === 0 && market.data_quality?.valid
          ? 'connected'
          : 'disconnected';
    const sources = usedSources(stocks, market);
    return response(200, {
      version: '2.2.0',
      generated_at: requestTime.toISOString(),
      status,
      connected_count: connected,
      total_count: stocks.length,
      data_source: sources.length
        ? `云端行情：${sources.join(' / ')}（扶摇→东方财富→腾讯→通达信）`
        : '云端行情：扶摇→东方财富→腾讯→通达信',
      fallback_order: ['fuyao', 'eastmoney', 'tencent', 'tongdaxin'],
      monitor_mode: 'page_open_only',
      market,
      stocks
    });
  } catch (error) {
    return response(502, {
      version: '2.2.0',
      generated_at: requestTime.toISOString(),
      status: 'disconnected',
      error: error?.message || '云端行情网关异常',
      stocks: []
    });
  }
};

exports._test = { parseWatchlist, response, usedSources };
