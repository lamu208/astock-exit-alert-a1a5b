const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
};

const DEFAULT_SETTINGS = { volume_ratio: 1.3 };
const LEVEL_ORDER = { none: 0, blue: 1, orange: 2, red: 3 };

function json(statusCode, body) {
  return { statusCode, headers: jsonHeaders, body: JSON.stringify(body) };
}

function digits(value) {
  const match = String(value || "").match(/\d{6}/);
  return match ? match[0] : "";
}

function exchangeSymbol(value) {
  const code = digits(value);
  if (!code) return "";
  if (code.startsWith("6")) return `${code}.SH`;
  if (code.startsWith("4") || code.startsWith("8") || code.startsWith("9")) return `${code}.BJ`;
  return `${code}.SZ`;
}

function vendorKey(symbol) {
  const code = digits(symbol);
  if (code.startsWith("6")) return `sh${code}`;
  if (code.startsWith("4") || code.startsWith("8") || code.startsWith("9")) return `bj${code}`;
  return `sz${code}`;
}

async function readText(url) {
  const response = await fetch(url, { headers: { "user-agent": "A-share-exit-alert/1.0" } });
  if (!response.ok) throw new Error(`行情接口 HTTP ${response.status}`);
  return response.text();
}

function parseQuote(raw) {
  const result = {};
  for (const line of raw.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const values = line.slice(separator + 1).trim().replace(/^"|";?$/g, "").split("~");
    if (values.length < 39) continue;
    const code = digits(values[2]);
    const price = Number(values[3]);
    if (!code || !Number.isFinite(price) || price <= 0) continue;
    result[code] = {
      symbol: exchangeSymbol(code),
      name: values[1] || code,
      price,
      prev_close: Number(values[4]) || price,
      volume: Number(values[36]) || 0,
      amount: Number(values[37]) || 0,
      open: Number(values[5]) || price,
      high: Number(values[33]) || price,
      low: Number(values[34]) || price,
      change_pct: Number(values[32]) || 0,
      source: "腾讯公开行情",
      timestamp: new Date().toISOString(),
      vendor_key: key,
    };
  }
  return result;
}

async function fetchQuotes(symbols) {
  const keys = [...new Set(symbols.map(vendorKey).filter(Boolean))];
  if (!keys.length) return {};
  const raw = await readText(`https://qt.gtimg.cn/q=${keys.join(",")}`);
  return parseQuote(raw);
}

function parseSearchHints(raw) {
  const encoded = raw.split("=").slice(1).join("=").trim().replace(/;$/, "");
  let payload;
  try { payload = JSON.parse(encoded); } catch { return []; }
  if (typeof payload !== "string") return [];
  return payload.split("^").map((item) => item.split("~")).filter((fields) => fields.length >= 3 && ["sh", "sz", "bj"].includes(fields[0].toLowerCase())).map((fields) => ({ symbol: exchangeSymbol(fields[1]), name: fields[2] || fields[1] })).filter((item) => item.symbol);
}

async function resolveItem(item) {
  const code = digits(item.symbol);
  if (code) return { ...item, symbol: exchangeSymbol(code) };
  const name = String(item.name || item.symbol || "").replace(/^NAME:/, "").trim();
  if (!name) return item;
  try {
    const raw = await readText(`https://smartbox.gtimg.cn/s3/?q=${encodeURIComponent(name)}&t=all`);
    return { ...item, ...(parseSearchHints(raw)[0] || {}), name };
  } catch {
    return { ...item, symbol: `NAME:${name}`, name };
  }
}

async function fetchHistory(symbol) {
  const key = vendorKey(symbol);
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?_var=kline_dayqfq&param=${key},day,,,70,qfqa`;
  try {
    const response = await fetch(url, { headers: { "user-agent": "A-share-exit-alert/1.0" } });
    if (!response.ok) return [];
    const payload = await response.json();
    const entry = payload?.data?.[key] || {};
    const rows = entry.qfqday || entry.day || entry.qfqweek || [];
    return rows.map((row) => ({ open: Number(row[1]), close: Number(row[2]), high: Number(row[3]), low: Number(row[4]), volume: Number(row[5]) })).filter((row) => Number.isFinite(row.close));
  } catch {
    return [];
  }
}

function evaluate(quote, settings) {
  const open = Number(quote.open) || 0;
  const high = Number(quote.high) || 0;
  const low = Number(quote.low) || 0;
  const close = Number(quote.price) || 0;
  const volume = Number(quote.volume) || 0;
  const average = Number(quote.avg_volume_5) || 0;
  const ma5 = Number(quote.ma5 || quote.trend_line) || 0;
  const ma10 = Number(quote.ma10) || 0;
  const ma20 = Number(quote.ma20) || 0;
  if (![open, high, low, close].every(Boolean)) return [];
  const body = Math.abs(close - open);
  const range = Math.max(0.0001, high - low);
  const upper = Math.max(0, high - Math.max(open, close));
  const lower = Math.max(0, Math.min(open, close) - low);
  const volumeRatio = average > 0 ? volume / average : 0;
  const volumeHit = average > 0 && volumeRatio >= Number(settings.volume_ratio || 1.3);
  const shrinkVolume = average > 0 && volumeRatio < 1;
  const change = quote.prev_close ? (close - Number(quote.prev_close)) / Number(quote.prev_close) : 0;
  const upperShadow = upper >= Math.max(body * 2, range * 0.35);
  const extremeUpperShadow = upper >= Math.max(body * 3, range * 0.60);
  const bars = Array.isArray(quote.recent_bars) ? quote.recent_bars : [];
  const priorBars = bars.slice(0, -1);
  const previous = priorBars.at(-1);
  const previousTwo = priorBars.slice(-2);
  const previousHigh = Math.max(...priorBars.slice(-20).map((bar) => Number(bar.high) || 0), 0);
  const recentLows = priorBars.slice(-5).map((bar) => Number(bar.low) || 0);
  const support = Math.max(ma20, Math.min(...recentLows, ma20));
  const rules = [];
  const addRule = (level, title, reason, action, priority) => rules.push({ level, title, reason, action, priority });
  const bullishAlignment = ma5 > ma10 && ma10 > ma20 && ma20 > 0;
  const hammer = lower >= Math.max(body * 2, range * 0.35) && upper <= Math.max(body, range * 0.20);
  const engulfing = Boolean(previous && Number(previous.close) < Number(previous.open) && close > open && close >= Number(previous.open) && open <= Number(previous.close));
  const pullbackConfirmed = Boolean(previous && ma10 > 0 && Math.abs(close - ma10) / ma10 <= 0.025 && shrinkVolume && (hammer || engulfing) && close >= Number(previous.close));
  const morningStar = previousTwo.length === 2 && Number(previousTwo[0].close) < Number(previousTwo[0].open) && Math.abs(Number(previousTwo[1].close) - Number(previousTwo[1].open)) <= Math.abs(Number(previousTwo[0].close) - Number(previousTwo[0].open)) * 0.5 && close > open && close > (Number(previousTwo[0].open) + Number(previousTwo[0].close)) / 2;
  const breakout = previousHigh > 0 && close > previousHigh;
  if (pullbackConfirmed) addRule("blue", "回踩确认·优先级最高", "缩量回踩 MA10/MA20 + 锤子线/吞没 + 重新转强，优先提醒加仓", "add", 35);
  else if (breakout && volumeRatio >= 1.3 && volumeRatio <= 1.8 && bullishAlignment) addRule("blue", "趋势突破·第1档加仓", "突破 20 日新高 + 量比 1.3～1.8 倍 + MA5＞MA10＞MA20，建立 30%～40% 底仓", "add", 30);
  else if (morningStar && breakout && volumeHit) addRule("blue", "反转形态·加仓", "早晨星 + 反弹突破前高 + 放量改善，按计划加仓", "add", 30);
  if (volumeHit && change > 0.003) addRule("blue", "上涨放量", `量比 ${volumeRatio.toFixed(2)} 倍，趋势确认，可加仓但禁止追高`, "add", 22);
  else if (!volumeHit && change > 0.003) addRule("blue", "上涨缩量", "上涨缩量，可持有，不追高", "hold", 10);
  else if (!volumeHit && change < -0.003) addRule("blue", "下跌缩量", "下跌缩量，属于正常回踩，观察支撑", "hold", 12);
  if (volumeHit && Math.abs(change) <= 0.01) addRule("orange", "放量滞涨·警示信号", `量比 ${volumeRatio.toFixed(2)} 倍但涨幅有限，警惕高位换手`, "warning", 40);
  if (extremeUpperShadow) {
    addRule("blue", "K线极端长上影·警示信号", "出现异常长上影，需结合量能检查仓位", "warning", 45);
    addRule("red", "极端长上影·立即清仓", "出现极端长上影线，严格按纪律立即清仓", "clear", 100);
  } else if (upperShadow && volumeHit) addRule("orange", "放量长上影·减仓信号", "放量出现长上影，按纪律减仓 50%～60%", "reduce_50_60", 80);
  else if (upperShadow) addRule("blue", "K线长影线·警示信号", "出现长影线，结合量能检查是否需要调整仓位", "warning", 45);
  const priorBigBull = priorBars.slice(-3).some((bar) => Number(bar.open) > 0 && (Number(bar.close) - Number(bar.open)) / Number(bar.open) >= 0.03);
  if (priorBigBull && upperShadow && volumeHit) addRule("orange", "大阳线后长上影·减仓信号", "连续大阳线后放量长上影，减仓 50%～60%", "reduce_50_60", 80);
  const highPoints = priorBars.slice(-10).map((bar) => Number(bar.high) || 0);
  const firstTop = Math.max(...highPoints.slice(0, 5), 0);
  const secondTop = Math.max(...highPoints.slice(5), 0);
  if (firstTop > 0 && secondTop > 0 && Math.abs(firstTop - secondTop) / Math.max(firstTop, secondTop) <= 0.03 && volumeHit) addRule("orange", "对子顶·减仓信号", "对子顶叠加放量，按纪律出 60%～70%", "exit_60_70", 90);
  if (ma5 > 0 && close < ma5) {
    if (volumeHit) addRule("orange", "放量破 MA5·止损", `最新价 ${close.toFixed(2)} 跌破 MA5 ${ma5.toFixed(2)} 且未收回，减仓 30%`, "stop_loss", 55);
    else if (shrinkVolume) addRule("blue", "缩量破 MA5·不卖", `最新价 ${close.toFixed(2)} 跌破 MA5 ${ma5.toFixed(2)}，仅观察，不卖`, "hold_no_sell", 20);
  }
  if (ma10 > 0 && close < ma10 && close >= ma20) addRule("blue", "跌破 MA10·警示信号", "缩量跌破 MA10 暂不动作；放量跌破 MA10 继续观察确认", "warning", volumeHit ? 40 : 20);
  if (ma20 > 0 && close < ma20) {
    if (volumeHit) addRule("orange", "放量跌破 MA20·减仓信号", `最新价 ${close.toFixed(2)} 跌破 MA20 ${ma20.toFixed(2)}，减仓 30%～50%`, "reduce_30_50", 70);
    else addRule("blue", "缩量跌破 MA20·不卖", "缩量跌破 MA20，先观察，不直接清仓", "hold_no_sell", 20);
  }
  if (volumeHit && support > 0 && close < support) addRule("orange", "结构破坏·继续减仓", "放量跌破前期突破平台或关键支撑，继续减仓", "reduce_30_50", 75);
  if (priorBars.length >= 3 && priorBars.slice(-3).some((bar) => Number(bar.close) < ma5) && previous && close > Number(previous.close) && low >= Math.min(...priorBars.slice(-3).map((bar) => Number(bar.low) || low))) addRule("blue", "破位后未创新低·D档加仓", "破位后 2～3 根 K 线不创新低，反弹补仓（D档加仓）", "d_add", 28);
  if (volumeHit && ma20 > 0 && close < ma20 && extremeUpperShadow) addRule("red", "放量跌破趋势线·立即离场", "放量跌破 MA20 并叠加极端长上影，立即减仓或清仓", "clear", 100);
  return rules;
}

function finalAction(rules) {
  return [...rules].sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))[0]?.action || "hold";
}

async function buildStock(item, quotes) {
  const watchKey = item.symbol;
  const resolved = await resolveItem(item);
  const code = digits(resolved.symbol);
  const quote = quotes[code];
  if (!quote) return { ...resolved, watch_key: watchKey, quote: { symbol: resolved.symbol, name: resolved.name || resolved.symbol, data_status: "unavailable", error: "暂时没有获取到行情", timestamp: new Date().toISOString() }, rules: [], action: "hold" };
  const history = await fetchHistory(resolved.symbol);
  const previous = history.length > 5 ? history.slice(-6, -1) : history.slice(0, -1);
  quote.avg_volume_5 = previous.length ? previous.reduce((sum, row) => sum + row.volume, 0) / previous.length : 0;
  const closes = history.map((row) => row.close);
  const movingAverage = (period) => {
    const sample = closes.slice(-period);
    return sample.length ? sample.reduce((sum, value) => sum + value, 0) / sample.length : quote.price;
  };
  quote.ma5 = movingAverage(5);
  quote.ma10 = movingAverage(10);
  quote.ma20 = movingAverage(20);
  quote.ma60 = movingAverage(60);
  quote.trend_line = quote.ma5;
  quote.trend_line_source = "MA5 趋势线";
  quote.volume_ratio = quote.avg_volume_5 ? quote.volume / quote.avg_volume_5 : 0;
  quote.recent_bars = history.slice(-70).map((row) => ({ open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume }));
  quote.recent_closes = history.slice(-30).map((row) => row.close);
  quote.candle = { open: quote.open, high: quote.high, low: quote.low, close: quote.price, volume: quote.volume };
  quote.data_status = "live";
  const rules = evaluate(quote, DEFAULT_SETTINGS);
  return { ...resolved, watch_key: watchKey, symbol: resolved.symbol, name: resolved.name || quote.name, quote, rules, action: finalAction(rules) };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { ...jsonHeaders, "access-control-allow-methods": "GET,OPTIONS" }, body: "" };
  const raw = event.queryStringParameters?.watchlist || "[]";
  let watchlist;
  try { watchlist = JSON.parse(raw); } catch { return json(400, { error: "watchlist 参数无效" }); }
  if (!Array.isArray(watchlist)) return json(400, { error: "watchlist 参数无效" });
  const resolved = await Promise.all(watchlist.slice(0, 30).map(resolveItem));
  const quotes = await fetchQuotes(resolved.map((item) => item.symbol));
  const stocks = await Promise.all(resolved.map((item) => buildStock(item, quotes)));
  const alerts = stocks.flatMap((stock) => stock.rules.map((rule) => ({ ...rule, symbol: stock.symbol, name: stock.name, timestamp: stock.quote.timestamp })));
  return json(200, { stocks, alerts, history: [], settings: DEFAULT_SETTINGS, data_source: "云端公开行情", demo_enabled: false });
};
