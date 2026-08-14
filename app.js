const state = { data: null, selected: null, seen: new Set(), paused: false, timer: null };
const localWatchlistKey = 'a-share-exit-watchlist';
const $ = (selector) => document.querySelector(selector);
const localWatchlist = () => { try { const value = JSON.parse(localStorage.getItem(localWatchlistKey) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
const saveWatchlist = (items) => localStorage.setItem(localWatchlistKey, JSON.stringify(items));
const stockKey = (stock) => stock.watch_key || (String(stock.symbol || '').startsWith('NAME:') ? stock.symbol : (stock.name ? `NAME:${stock.name}` : stock.symbol));
const watchlistQuery = () => encodeURIComponent(JSON.stringify(localWatchlist()));
const accessToken = new URLSearchParams(location.search).get('token') || localStorage.getItem('exit-alert-token') || '';
if (accessToken) localStorage.setItem('exit-alert-token', accessToken);
const apiBase = location.hostname === 'subtle-palmier-6ca45c.netlify.app' ? '' : 'https://subtle-palmier-6ca45c.netlify.app';
const useDirectMarket = location.hostname.endsWith('.github.io');

function jsonp(url, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const callback = `__astock_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const cleanup = () => { clearTimeout(timer); script.remove(); delete window[callback]; };
    const timer = setTimeout(() => { cleanup(); reject(new Error('行情请求超时')); }, timeout);
    window[callback] = (payload) => { cleanup(); resolve(payload); };
    script.onerror = () => { cleanup(); reject(new Error('行情请求失败')); };
    script.src = `${url}${url.includes('?') ? '&' : '?'}cb=${callback}`;
    document.head.appendChild(script);
  });
}

function directSecIds(code) { return /^[569]/.test(code) ? [`1.${code}`, `0.${code}`] : [`0.${code}`, `1.${code}`]; }
function directScale(code, name = '') { return /^(15|16|50|51|52|56|58|59)\d{4}$/.test(code) || /ETF|LOF|基金/i.test(name) ? 1000 : 100; }
function tencentKey(code) { return `${/^[569]/.test(code) ? 'sh' : 'sz'}${code}`; }
function loadAssignedScript(url, variable, timeout = 10000) {
  return new Promise((resolve) => {
    let done = false; const script = document.createElement('script'); const previous = window[variable]; delete window[variable];
    const finish = () => { if (done) return; done = true; clearTimeout(timer); script.remove(); const value = window[variable]; if (previous === undefined) delete window[variable]; else window[variable] = previous; resolve(value || null); };
    const timer = setTimeout(finish, timeout); script.onload = finish; script.onerror = finish; script.src = url; document.head.appendChild(script);
  });
}
async function tencentQuote(code) {
  const key = tencentKey(code); const raw = await loadAssignedScript(`https://qt.gtimg.cn/q=${key}&_=${Date.now()}`, `v_${key}`); const values = String(raw || '').split('~');
  if (values.length < 39 || !number(values[3])) return null; const trade = String(values[35] || '').split('/');
  return { symbol:code, name:values[1] || code, price:number(values[3]), prev_close:number(values[4]), open:number(values[5]), high:number(values[33]), low:number(values[34]), volume:number(values[36]), amount:number(trade[2]) || number(values[37]) * 10000, change_pct:number(values[32]), data_status:'live', source:'腾讯公开行情', timestamp:new Date().toISOString() };
}
async function tencentHistory(code) {
  const key = tencentKey(code); const variable = `astock_kline_${code}_${Date.now()}`; const payload = await loadAssignedScript(`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${key},day,,,120,qfq&_var=${variable}`, variable, 12000);
  const entry = payload?.data?.[key] || {}; return (entry.qfqday || entry.day || []).map((row) => ({ open:number(row[1]), close:number(row[2]), high:number(row[3]), low:number(row[4]), volume:number(row[5]) })).filter((row) => row.close > 0);
}
function resolveStockName(name) {
  return new Promise((resolve) => {
    const script = document.createElement('script'); const previous = window.v_hint; window.v_hint = '';
    const finish = () => { clearTimeout(timer); script.remove(); const raw = String(window.v_hint || ''); window.v_hint = previous; const fields = raw.split('^')[0]?.split('~') || []; resolve(fields.length >= 3 ? { code:fields[1], name:fields[2] } : null); };
    const timer = setTimeout(finish, 8000); script.onload = finish; script.onerror = finish;
    script.src = `https://smartbox.gtimg.cn/s3/?q=${encodeURIComponent(name)}&t=all&_=${Date.now()}`; document.head.appendChild(script);
  });
}
function directRule(level, title, reason, action, priority, scope = 'position') { return { level, title, reason, action, priority, scope }; }
function directDecision(rules, fallbackAction, scope) {
  return [...rules].sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))[0] || directRule('none', '纪律判断', scope === 'entry' ? '尚未触发加仓条件' : '趋势未出现需要处理的破坏信号', fallbackAction, 0, scope);
}
function directEvaluate(quote) {
  const positionRules = []; const entryRules = []; const bars = Array.isArray(quote.recent_bars) ? quote.recent_bars : []; const prior = bars.slice(0, -1); const closes = bars.map((bar) => number(bar.close)).filter(Boolean);
  const close = number(quote.price); const open = number(quote.open); const high = number(quote.high); const low = number(quote.low); const previousClose = number(quote.prev_close); const change = changeOf(quote);
  const ratio = number(quote.volume_ratio); const volumeHit = ratio >= 1.3; const hugeVolume = ratio >= 1.8; const shrink = ratio > 0 && ratio < 1; const bullishVolume = ratio >= 1.3 && ratio <= 1.8;
  const ma5 = number(quote.ma5); const ma10 = number(quote.ma10); const ma20 = number(quote.ma20); const bullishAlignment = ma5 > ma10 && ma10 > ma20 && ma20 > 0;
  const body = Math.abs(close - open); const range = Math.max(.0001, high - low); const upper = Math.max(0, high - Math.max(open, close)); const lower = Math.max(0, Math.min(open, close) - low);
  const hammer = lower >= Math.max(body * 2, range * .35) && upper <= Math.max(body, range * .2); const upperShadow = upper >= Math.max(body * 2, range * .35); const extremeUpperShadow = upper >= Math.max(body * 3, range * .55) && hugeVolume;
  const previous = prior.at(-1); const previousTwo = prior.slice(-2); const previousHigh20 = Math.max(...prior.slice(-20).map((bar) => number(bar.high)), 0); const previousHigh = Math.max(...prior.slice(-5).map((bar) => number(bar.high)), 0);
  const previousBull = Boolean(previous && number(previous.open) > 0 && (number(previous.close) - number(previous.open)) / number(previous.open) >= .03); const longUpperAfterBull = upperShadow && volumeHit && previousBull;
  const engulfing = Boolean(previous && number(previous.close) < number(previous.open) && close > open && close >= number(previous.open) && open <= number(previous.close));
  const morningStar = previousTwo.length === 2 && number(previousTwo[0].close) < number(previousTwo[0].open) && Math.abs(number(previousTwo[1].close) - number(previousTwo[1].open)) <= Math.abs(number(previousTwo[0].close) - number(previousTwo[0].open)) * .5 && close > open && close > (number(previousTwo[0].open) + number(previousTwo[0].close)) / 2;
  const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; const priorMa5 = average(closes.slice(-6, -1)); const priorMa10 = average(closes.slice(-11, -1));
  const ma5Sequence = [average(closes.slice(-7, -2)), priorMa5, ma5]; const ma5Weakening = ma5Sequence.every(Boolean) && ma5Sequence[0] > ma5Sequence[1] && ma5Sequence[1] > ma5Sequence[2]; const ma5CrossDown = ma5 < ma10 && priorMa5 >= priorMa10;
  const recentDeclines = prior.slice(-3).map((bar) => Math.max(0, number(bar.open) - number(bar.close))); const declineFading = recentDeclines.length === 3 && recentDeclines[0] > recentDeclines[1] && recentDeclines[1] >= recentDeclines[2];
  const currentBar = { open, close, high, low }; const chaseBars = [...prior.slice(-2), currentBar]; const threeBigBull = chaseBars.length === 3 && chaseBars.every((bar) => number(bar.open) > 0 && (number(bar.close) - number(bar.open)) / number(bar.open) >= .03); const farAboveMa20 = ma20 > 0 && close / ma20 - 1 > .10;
  const chaseBan = threeBigBull || farAboveMa20 || extremeUpperShadow; const chaseReasons = [threeBigBull && '连续3根大阳线', farAboveMa20 && `距离MA20超过10%（当前${((close / ma20 - 1) * 100).toFixed(1)}%）`, extremeUpperShadow && '放巨量极端长上影线'].filter(Boolean);

  const peakWindow = prior.slice(-30, -3); const firstPeak = Math.max(...peakWindow.map((bar) => number(bar.high)), 0); const firstPeakIndex = peakWindow.findIndex((bar) => number(bar.high) === firstPeak); const afterPeak = firstPeakIndex >= 0 ? peakWindow.slice(firstPeakIndex + 1) : []; const troughAfterPeak = Math.min(...afterPeak.map((bar) => number(bar.low)).filter(Boolean), Infinity); const doubleTop = firstPeak > 0 && Number.isFinite(troughAfterPeak) && troughAfterPeak <= firstPeak * .96 && high >= firstPeak * .98 && high <= firstPeak * 1.03 && close < high - range * .2;
  const supportLows = prior.slice(-10).map((bar) => number(bar.low)).filter(Boolean); const keySupport = supportLows.length ? Math.min(...supportLows) : 0;
  const volumeStall = volumeHit && previousClose > 0 && Math.abs(change) <= .01 && upper >= range * .25;

  if (extremeUpperShadow) positionRules.push(directRule('red', '极端长上影线', '巨量伴随极端长上影线，按纪律立即清仓', 'clear', 120));
  if (doubleTop && volumeHit) positionRules.push(directRule('red', '对子顶放量', '两次冲击相近高点、中间明显回落且本次放量受阻，按纪律出60%-70%', 'exit_60_70', 110));
  if (longUpperAfterBull) positionRules.push(directRule('orange', '大阳线后放量长上影', '前一交易日大阳线后出现放量长上影，警惕资金兑现，减仓50%-60%', 'reduce_50_60', 100));
  if ((ma5CrossDown || ma5 < ma10) && ma5Weakening && volumeHit && close < ma20) positionRules.push(directRule('red', '第五层·趋势反转', 'MA5下穿并持续走弱，量价确认且跌破MA20，按纪律离场', 'exit', 95));
  if (volumeHit && keySupport > 0 && close < keySupport) positionRules.push(directRule('orange', '第四层·结构破坏', `放量跌破前期平台/关键支撑 ${keySupport.toFixed(3)}，继续减仓`, 'reduce_30_50', 90));
  if (ma20 > 0 && close < ma20) positionRules.push(volumeHit ? directRule('orange', '第三层·趋势破坏', `放量跌破MA20 ${ma20.toFixed(3)}，建议减仓30%-50%`, 'reduce_30_50', 80) : directRule('blue', '第三层·缩量破位', '缩量跌破MA20，先观察，不直接减仓', 'hold_no_sell', 42));
  if (ma5 > 0 && close < ma5) positionRules.push(volumeHit ? directRule('orange', '放量跌破MA5', `放量跌破MA5 ${ma5.toFixed(3)}且尚未收回，按纪律止损减仓30%`, 'stop_loss', 70) : directRule('blue', '第一层·动能减弱', `缩量跌破MA5 ${ma5.toFixed(3)}，仅作观察，不卖`, 'hold_no_sell', 35));
  if (ma10 > 0 && close < ma10) positionRules.push(directRule(volumeHit ? 'orange' : 'blue', '第二层·趋势转弱', volumeHit ? '放量跌破MA10，进入警示观察，暂不直接卖出' : '缩量跌破MA10，暂不动作', volumeHit ? 'warning' : 'hold_no_sell', volumeHit ? 55 : 38));
  if (volumeStall) positionRules.push(directRule('orange', '放量滞涨', '成交量放大但价格未有效推进并出现上影，警惕高位换手', 'warning', 58));
  else if (upperShadow && volumeHit) positionRules.push(directRule('orange', '放量长上影', '放量伴随长上影线，警惕资金兑现，进入减仓观察', 'warning', 60));

  if (chaseBan) {
    entryRules.push(directRule('orange', '禁止追高', `${chaseReasons.join('、')}，禁止新增仓位；现有仓位仍按持仓纪律单独判断`, 'warning', 100, 'entry'));
  } else {
    const supportDistance = ma10 > 0 && ma20 > 0 ? Math.min(Math.abs(close - ma10) / ma10, Math.abs(close - ma20) / ma20) : Infinity; const nearSupport = supportDistance <= .025; const pullbackSetup = shrink && bullishAlignment && close <= ma5 * 1.01;
    const breakWindow = prior.slice(-3); const breakStart = Math.max(4, bars.length - 4); const recentBreakIndexes = Array.from({ length: Math.max(0, bars.length - 1 - breakStart) }, (_, index) => breakStart + index); const hadRecentMa5Break = recentBreakIndexes.some((barIndex) => number(bars[barIndex].close) < average(bars.slice(barIndex - 4, barIndex + 1).map((bar) => number(bar.close)))); const breakLows = breakWindow.map((bar) => number(bar.low)).filter(Boolean); const noNewLow = breakLows.length >= 2 && breakLows.at(-1) >= Math.min(...breakLows.slice(0, -1)); const previousIndex = bars.length - 2; const previousBarMa5 = previousIndex >= 4 ? average(bars.slice(previousIndex - 4, previousIndex + 1).map((bar) => number(bar.close))) : 0; const reclaimedMa5 = close > ma5 && previousBarMa5 > 0 && previous && number(previous.close) <= previousBarMa5 && close > number(previous.close);
    if (shrink && nearSupport && (hammer || engulfing) && previous && close > number(previous.close)) entryRules.push(directRule('blue', '②回踩确认·第2档加仓', '缩量回踩MA10/MA20 + 锤子线/吞没 + 重新转强，优先建议加仓20%-30%', 'add', 80, 'entry'));
    else if (pullbackSetup) entryRules.push(directRule('blue', '第2档加仓候选·等待确认', nearSupport ? '已缩量回踩MA10/MA20，但尚未同时出现止跌形态与重新转强；确认后建议加仓20%-30%' : `多头排列 + 缩量回调，但距离MA10/MA20仍有${(supportDistance * 100).toFixed(1)}%，尚未回踩支撑；暂不加仓`, 'add_watch', 50, 'entry'));
    if (hadRecentMa5Break && noNewLow && reclaimedMa5) entryRules.push(directRule('blue', 'D档反弹补仓', '破位后2-3根K线未创新低，随后重新站回MA5并转强，建议按D档小仓补仓', 'd_add', 75, 'entry'));
    if (previousHigh20 > 0 && close > previousHigh20 && bullishVolume && bullishAlignment) entryRules.push(directRule('blue', '①趋势突破·第1档加仓', '突破20日新高 + 放量1.3～1.8倍 + MA5>MA10>MA20，建议加仓30%-40%建立底仓', 'add', 70, 'entry'));
    if (volumeHit && previousHigh > 0 && close > previousHigh && bullishAlignment) entryRules.push(directRule('blue', '第3档金字塔加仓', '放量突破前高 + 多头排列保持，建议加仓10%-20%', 'add', 65, 'entry'));
    if (morningStar && previousHigh > 0 && close > previousHigh && volumeHit) entryRules.push(directRule('blue', '③反转形态·建议加仓', '早晨星 + 反弹突破前高 + 放量改善，建议按计划小仓加仓', 'add', 60, 'entry'));
    if (ma20 > 0 && close < ma20 * .9 && declineFading && change > -.03) entryRules.push(directRule('blue', '④超跌反弹·等待板块确认', '股价超跌 + 下跌衰减；缺少板块企稳数据，降级为等待确认，仅允许≤20%小仓', 'add_watch', 45, 'entry'));
  }

  const positionDecision = directDecision(positionRules, 'hold', 'position'); const entryDecision = directDecision(entryRules, 'no_add', 'entry'); const hardPositionActions = new Set(['clear', 'exit', 'exit_60_70', 'reduce_50_60', 'reduce_30_50', 'stop_loss', 'reduce']);
  let finalDecision = positionDecision;
  if (!hardPositionActions.has(positionDecision.action)) {
    if (entryDecision.action === 'warning') finalDecision = entryDecision;
    else if (['add', 'd_add'].includes(entryDecision.action)) finalDecision = entryDecision;
    else if (['warning', 'hold_no_sell'].includes(positionDecision.action)) finalDecision = positionDecision;
    else if (entryDecision.action === 'add_watch') finalDecision = entryDecision;
  }
  return { rules:[...positionRules, ...entryRules], positionDecision, entryDecision, finalDecision };
}
async function directStock(item) {
  let code = String(item.symbol || '').match(/\d{6}/)?.[0]; let resolvedName = item.name || '';
  if (!code) { const matched = await resolveStockName(String(item.name || item.symbol || '').replace(/^NAME:/, '').trim()); code = matched?.code; resolvedName = matched?.name || resolvedName; }
  if (!code) return { ...item, watch_key:item.symbol, quote:{ symbol:item.symbol, name:resolvedName || item.symbol, data_status:'unavailable', error:'没有找到对应股票，请改用6位股票代码' }, rules:[], action:'hold' };
  let quote = null; try { quote = await tencentQuote(code); } catch {}
  if (!quote) {
    for (const secid of directSecIds(code)) { try { const candidate = await jsonp(`https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f44,f45,f46,f47,f48,f57,f58,f60,f170`); const payload = candidate?.data; if (payload?.f57) { const scale = directScale(code, payload.f58 || ''); quote = { symbol:code, name:payload.f58 || code, price:number(payload.f43) / scale, prev_close:number(payload.f60) / scale, open:number(payload.f46) / scale, high:number(payload.f44) / scale, low:number(payload.f45) / scale, volume:number(payload.f47), amount:number(payload.f48), change_pct:number(payload.f170) / 100, data_status:'live', source:'东方财富公开行情', timestamp:new Date().toISOString() }; break; } } catch {} }
  }
  if (!quote) return { ...item, watch_key:item.symbol, quote:{ symbol:code, name:resolvedName || code, data_status:'unavailable', error:'公开行情暂时不可用' }, rules:[], action:'hold' };
  let history = []; try { history = await tencentHistory(code); } catch {}
  if (history.length < 5) for (const secid of directSecIds(code)) { try { const candidate = await jsonp(`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56&klt=101&fqt=1&beg=0&end=20500101`); history = (candidate?.data?.klines || []).map((line) => String(line).split(',')).map((row) => ({ open:number(row[1]), close:number(row[2]), high:number(row[3]), low:number(row[4]), volume:number(row[5]) })).filter((row) => row.close > 0); if (history.length >= 5) break; } catch {} }
  const movingAverage = (period) => { const rows = history.slice(-period); return rows.length >= period ? rows.reduce((sum, row) => sum + row.close, 0) / rows.length : 0; };
  const previous = history.slice(-6, -1); const avgVolume = previous.length ? previous.reduce((sum, row) => sum + row.volume, 0) / previous.length : 0;
  Object.assign(quote, { ma5:movingAverage(5), ma10:movingAverage(10), ma20:movingAverage(20), ma60:movingAverage(60), avg_volume_5:avgVolume, volume_ratio:avgVolume ? number(quote.volume) / avgVolume : 0, recent_bars:history.slice(-70), recent_closes:history.slice(-30).map((row) => row.close), history_bars:history.length });
  const evaluation = directEvaluate(quote);
  return {
    ...item,
    watch_key:item.symbol,
    symbol:code,
    name:resolvedName || quote.name,
    quote,
    rules:evaluation.rules,
    action:evaluation.finalDecision.action,
    decision_rule:evaluation.finalDecision,
    position_action:evaluation.positionDecision.action,
    position_rule:evaluation.positionDecision,
    entry_action:evaluation.entryDecision.action,
    entry_rule:evaluation.entryDecision
  };
}
async function directState() { const stocks = await Promise.all(localWatchlist().slice(0, 30).map(directStock)); return { stocks, alerts:stocks.flatMap((stock) => stock.rules.map((rule) => ({ ...rule, symbol:stock.symbol, name:stock.name }))), data_source:'东方财富公开行情（浏览器直连）' }; }

const levelOrder = { none: 0, blue: 1, yellow: 2, orange: 3, red: 4 };
const levelText = { none: '持有', blue: '注意', yellow: '警示', orange: '减仓', red: '离场' };
const actionText = { add: '建议加仓', add_watch: '等待加仓确认', hold: '持有观望', warning: '警示信号', reduce_30_50: '减仓30%-50%', hold_no_sell: '不卖', stop_loss: '止损减仓', d_add: 'D档加仓', reduce_50_60: '减仓50%-60%', exit_60_70: '出60%-70%', exit: '纪律离场', clear: '清仓', reduce: '减仓' };
actionText.no_add = '暂不加仓';

function apiFetch(input, options = {}) { const headers = new Headers(options.headers || {}); if (accessToken) headers.set('X-Access-Token', accessToken); return fetch(input, { ...options, headers }); }
function number(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[character])); }
function formatNumber(value) { const parsed = number(value, NaN); if (!Number.isFinite(parsed)) return '—'; if (Math.abs(parsed) >= 100000000) return `${(parsed / 100000000).toFixed(2)}亿`; if (Math.abs(parsed) >= 10000) return `${(parsed / 10000).toFixed(1)}万`; return parsed.toLocaleString('zh-CN'); }
function formatMetric(value, digits = 2) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed.toFixed(digits) : '暂无数据'; }
function stockCode(stock) { const candidate = stock.quote?.symbol || stock.symbol || ''; const match = String(candidate).match(/\d{6}/); return match ? match[0] : String(stock.symbol || '').replace('NAME:', ''); }
function instrumentDigits(stock) { const code = stockCode(stock); return /^(15|16|50|51|52|56|58|59)\d{4}$/.test(code) || /ETF|LOF|基金/i.test(`${stock.name || ''} ${stock.quote?.name || ''}`) ? 3 : 2; }
function formatPrice(value, stock) { return formatMetric(value, instrumentDigits(stock)); }
function changeOf(quote) { return quote.prev_close ? (number(quote.price) - number(quote.prev_close)) / number(quote.prev_close) : number(quote.change_pct) / 100; }
function trendClass(change) { return change > .0001 ? 'rise' : change < -.0001 ? 'fall' : 'flat'; }
function formatChange(change) { return `${change > 0 ? '+' : ''}${(change * 100).toFixed(2)}%`; }
function highestLevel(rules = []) { return rules.reduce((best, rule) => levelOrder[rule.level] > levelOrder[best] ? rule.level : best, 'none'); }
function actionFor(stock) { const level = highestLevel(stock.rules); return stock.action || (level === 'red' ? 'clear' : level === 'orange' ? 'reduce_30_50' : (stock.rules || []).some((rule) => rule.title === '上涨放量') ? 'add' : 'hold'); }
function actionMessage(action) { if (['clear', 'exit'].includes(action)) return '执行第五层趋势反转离场纪律'; if (action === 'exit_60_70') return '执行出 60%～70% 纪律'; if (action === 'reduce_50_60') return '执行减仓 50%～60% 纪律'; if (['reduce_30_50', 'stop_loss', 'reduce'].includes(action)) return '执行分批减仓纪律'; if (action === 'add_watch') return '等待止跌形态与重新转强确认'; if (action === 'warning') return '警示信号，按优先级观察'; if (action === 'hold_no_sell') return '不卖，继续观察'; if (['add', 'd_add'].includes(action)) return '符合计划加仓条件'; return '当前按纪律持有观察'; }
function actionButtonText(action, unavailable) { if (unavailable) return '待连接'; if (action === 'clear') return '✕ 清仓'; if (action === 'exit') return '✕ 纪律离场'; if (action === 'exit_60_70') return '− 出60%-70%'; if (['reduce_30_50', 'reduce_50_60', 'stop_loss', 'reduce'].includes(action)) return '− 出一部分'; if (action === 'add_watch') return '⌛ 等待加仓确认'; if (action === 'warning') return '⚠ 警示观察'; if (action === 'hold_no_sell') return '▮▮ 不卖观察'; if (action === 'd_add') return '＋ D档加仓'; if (action === 'add') return '＋ 建议加仓'; return '▮▮ 持有观望'; }
function actionTone(action, unavailable) { if (unavailable) return 'unavailable'; if (['clear', 'exit'].includes(action)) return 'clear'; if (['exit_60_70', 'reduce_30_50', 'reduce_50_60', 'stop_loss', 'reduce'].includes(action)) return 'reduce'; if (['warning', 'add_watch'].includes(action)) return 'warning'; if (['add', 'd_add'].includes(action)) return 'add'; return 'hold'; }
function topRule(stock) { return stock.decision_rule || [...(stock.rules || [])].sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))[0]; }
function stockReason(stock, action, unavailable) {
  if (unavailable) return { text: stock.quote?.error || '行情暂不可用', summary: '等待行情连接' };
  const rule = topRule(stock);
  if (!rule) return { text: '未触发加仓、减仓或离场条件，按纪律持有观察', summary: '趋势完整：持有观望' };
  let layer = '量价信号';
  if (['clear', 'exit', 'exit_60_70'].includes(action)) layer = '第五层：趋势反转→离场';
  else if (['reduce_30_50', 'reduce_50_60', 'stop_loss', 'reduce'].includes(action)) layer = '第三层：趋势破坏→减仓';
  else if (action === 'add_watch') layer = '第2档候选：等待止跌确认';
  else if (action === 'warning') layer = '第一层：量价→警示';
  else if (['add', 'd_add'].includes(action)) layer = '入场信号：按档加仓';
  else if (action === 'hold_no_sell') layer = '第一层：缩量破位→不卖';
  else layer = '趋势完整：持有观望';
  return { text: rule.reason || rule.title || actionMessage(action), summary: layer };
}

function dualDecisionSummary(stock) {
  const position = actionText[stock.position_action || 'hold'] || '持有观望';
  const entry = stock.entry_action === 'warning' ? '禁止追高' : (actionText[stock.entry_action || 'no_add'] || '暂不加仓');
  return `持仓：${position}｜加仓：${entry}`;
}

function renderStatus() {
  const status = $('#data-status'); const stocks = state.data?.stocks || [];
  const live = stocks.filter((stock) => stock.quote.data_status === 'live').length;
  const demo = stocks.filter((stock) => stock.quote.data_status === 'demo').length;
  if (state.paused) { status.className = 'connection-state paused'; status.innerHTML = '<i></i><span>已暂停</span>'; }
  else if (!localWatchlist().length) { status.className = 'connection-state ok'; status.innerHTML = '<i></i><span>等待添加股票</span>'; }
  else if (live) { status.className = 'connection-state ok'; status.innerHTML = `<i></i><span>${live} 只实时监控</span>`; }
  else if (demo) { status.className = 'connection-state demo'; status.innerHTML = '<i></i><span>演示数据</span>'; }
  else { status.className = 'connection-state error'; status.innerHTML = '<i></i><span>行情未连接</span>'; }
}

function metricRows(stock) {
  const quote = stock.quote; const digits = instrumentDigits(stock);
  const volumeRatio = quote.avg_volume_5 ? `${number(quote.volume_ratio || quote.volume / quote.avg_volume_5).toFixed(2)}` : '暂无数据';
  return [
    ['MA5（趋势线）', formatMetric(quote.ma5 || quote.trend_line, digits)], ['MA10', formatMetric(quote.ma10, digits)],
    ['MA20', formatMetric(quote.ma20, digits)], ['MA60', formatMetric(quote.ma60, digits)],
    ['量比（vs 5日均）', volumeRatio], ['成交额', formatNumber(quote.amount)],
    ['今开 / 昨收', `${formatMetric(quote.open, digits)} / ${formatMetric(quote.prev_close, digits)}`], ['最高 / 最低', `${formatMetric(quote.high, digits)} / ${formatMetric(quote.low, digits)}`]
  ];
}

function renderWatchlist() {
  const stocks = state.data?.stocks || []; const host = $('#watchlist');
  if (!stocks.length) { host.className = 'stock-list empty-state'; host.innerHTML = '<strong>还没有自选股</strong><span>输入股票代码或名称开始盯盘</span>'; return; }
  host.className = 'stock-list';
  host.innerHTML = stocks.map((stock) => {
    const quote = stock.quote; const unavailable = quote.data_status === 'unavailable'; const change = unavailable ? 0 : changeOf(quote); const tone = trendClass(change); const action = unavailable ? 'hold' : actionFor(stock); const actionToneName = actionTone(action, unavailable); const reason = stockReason(stock, action, unavailable); const metrics = metricRows(stock); const absolute = unavailable ? '—' : number(quote.price) - number(quote.prev_close);
    const dualSummary = unavailable ? '等待行情连接' : dualDecisionSummary(stock);
    return `<article class="stock-card" data-symbol="${escapeHtml(stockKey(stock))}">
      <button class="stock-remove" type="button" aria-label="移除 ${escapeHtml(stock.name || quote.name || stock.symbol)}" data-remove="${escapeHtml(stockKey(stock))}">×</button>
      <div class="stock-card-title"><strong>${escapeHtml(stock.name || quote.name || stock.symbol)}</strong><span>${escapeHtml(stockCode(stock))}</span></div>
      <div class="stock-quote ${tone}"><strong>${unavailable ? '—' : formatPrice(quote.price, stock)}</strong><span>${unavailable ? '行情不可用' : formatChange(change)}</span><span>${unavailable ? '' : `(${absolute >= 0 ? '+' : ''}${absolute.toFixed(instrumentDigits(stock))})`}</span></div>
      <button class="stock-action ${actionToneName}" type="button">${escapeHtml(actionButtonText(action, unavailable))}</button>
      <div class="stock-metrics">
        <div><span>${metrics[0][0]}</span><strong>${metrics[0][1]}</strong></div><div><span>${metrics[1][0]}</span><strong>${metrics[1][1]}</strong></div>
        <div><span>${metrics[2][0]}</span><strong>${metrics[2][1]}</strong></div><div><span>${metrics[3][0]}</span><strong>${metrics[3][1]}</strong></div>
        <div><span>${metrics[4][0]}</span><strong>${metrics[4][1]}</strong></div><div><span>${metrics[5][0]}</span><strong>${metrics[5][1]}</strong></div>
        <div><span>${metrics[6][0]}</span><strong>${metrics[6][1]}</strong></div><div><span>${metrics[7][0]}</span><strong>${metrics[7][1]}</strong></div>
      </div>
      <div class="stock-reason-row ${actionToneName}"><span><i>i</i><b>${escapeHtml(topRule(stock)?.title || (unavailable ? '行情连接' : '纪律判断'))}</b><em>${escapeHtml(reason.text)}</em></span><strong>${escapeHtml(dualSummary)}</strong></div>
    </article>`;
  }).join('');
  host.querySelectorAll('.stock-card').forEach((card) => card.addEventListener('click', (event) => { if (!event.target.closest('button')) openDetail(card.dataset.symbol); }));
  host.querySelectorAll('.stock-action').forEach((button) => button.addEventListener('click', (event) => openDetail(event.currentTarget.closest('.stock-card').dataset.symbol)));
  host.querySelectorAll('.stock-remove').forEach((button) => button.addEventListener('click', async (event) => { event.stopPropagation(); await removeStock(button.dataset.remove); }));
}

function renderDetail(stock) {
  const quote = stock.quote; const unavailable = quote.data_status === 'unavailable'; const action = unavailable ? 'hold' : actionFor(stock); const change = unavailable ? 0 : changeOf(quote); const decision = unavailable ? '行情暂不可用' : `${actionText[action]} · ${actionMessage(action)} · ${dualDecisionSummary(stock)}`;
  $('#detail-code').textContent = stockCode(stock); $('#detail-name').textContent = stock.name || quote.name || stock.symbol;
  const decisionCard = $('#detail-decision'); decisionCard.className = `decision-card ${actionTone(action, unavailable)}`; decisionCard.textContent = decision;
  const digits = instrumentDigits(stock); $('#detail-price').textContent = unavailable ? '—' : formatPrice(quote.price, stock); const changeNode = $('#detail-change'); changeNode.textContent = unavailable ? '—' : formatChange(change); changeNode.className = trendClass(change); $('#detail-action').textContent = unavailable ? '待连接' : actionText[action];
  $('#detail-source').textContent = unavailable ? `行情未连接：${quote.error || '数据源暂不可用'}` : `数据来源：${quote.source || state.data.data_source || '云端公开行情'} · 历史 K 线 ${quote.history_bars || 0} 根`;
  const metrics = metricRows(stock); $('#detail-metrics').innerHTML = metrics.map(([label, value], index) => `<div class="metric-item"><span>${label}</span><strong class="${index === 0 && number(quote.price) < number(quote.ma5 || quote.trend_line) ? 'danger' : ''}">${value}</strong></div>`).join('');
  const rules = [...(stock.rules || [])].sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0)); $('#detail-reasons').innerHTML = rules.length ? rules.map((rule) => `<div class="reason-row ${rule.level}"><i class="reason-dot"></i><div><strong>${escapeHtml(actionText[rule.action] || levelText[rule.level])} · ${escapeHtml(rule.title)}</strong><span>${escapeHtml(rule.reason)}</span></div></div>`).join('') : '<div class="reason-row"><i class="reason-dot"></i><div><strong>持有观望</strong><span>暂未触发图片中的加仓、警示、减仓或清仓条件。</span></div></div>';
}

function openDetail(symbol) { const stock = (state.data?.stocks || []).find((item) => stockKey(item) === symbol); if (!stock) return; state.selected = symbol; renderDetail(stock); $('#detail-sheet').classList.add('open'); $('#detail-sheet').setAttribute('aria-hidden', 'false'); }
function closeDetail() { $('#detail-sheet').classList.remove('open'); $('#detail-sheet').setAttribute('aria-hidden', 'true'); }
async function removeStock(symbol) { saveWatchlist(localWatchlist().filter((item) => item.symbol !== symbol)); if (state.selected === symbol) { state.selected = null; closeDetail(); } await refresh(); }
async function removeSelected() { if (state.selected) await removeStock(state.selected); }
function announce(alert) { const key = `${alert.symbol}-${alert.level}-${alert.title}`; if (state.seen.has(key)) return; state.seen.add(key); const banner = $('#alert-banner'); banner.className = `alert-banner ${alert.level}`; banner.innerHTML = `${escapeHtml(alert.name || alert.symbol)} · ${escapeHtml(actionText[alert.action] || levelText[alert.level])}<span>${escapeHtml(alert.title)}：${escapeHtml(alert.reason)}</span>`; const toast = $('#toast'); toast.textContent = `${actionText[alert.action] || levelText[alert.level]}：${alert.name || alert.symbol} ${alert.title}`; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 4200); }
function render() { renderStatus(); renderWatchlist(); }

async function refresh() {
  if (state.paused) return;
  $('#data-status').className = 'connection-state loading'; $('#data-status').innerHTML = '<i></i><span>刷新中...</span>';
  try {
    if (useDirectMarket) state.data = await directState();
    else { const response = await apiFetch(`${apiBase}/api/state?watchlist=${watchlistQuery()}`); if (!response.ok) throw new Error(`HTTP ${response.status}`); state.data = await response.json(); }
    render();
    const time = new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }); $('#header-refresh-time').textContent = `更新于 ${time}`; $('#last-refresh').textContent = `更新于 ${time} · ${state.data.data_source || '云端公开行情'}`;
    [...(state.data.alerts || [])].sort((a, b) => levelOrder[b.level] - levelOrder[a.level]).forEach(announce);
  } catch {
    try { state.data = await directState(); render(); const time = new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }); $('#header-refresh-time').textContent = `更新于 ${time}`; $('#last-refresh').textContent = `更新于 ${time} · ${state.data.data_source}`; [...state.data.alerts].sort((a, b) => levelOrder[b.level] - levelOrder[a.level]).forEach(announce); }
    catch { $('#data-status').className = 'connection-state error'; $('#data-status').innerHTML = '<i></i><span>刷新失败</span>'; showToast('公开行情暂时不可用，请稍后重试'); }
  }
}
function showToast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); setTimeout(() => $('#toast').classList.remove('show'), 3200); }
function scheduleRefresh() { clearInterval(state.timer); if (!state.paused) state.timer = setInterval(refresh, number($('#refresh-interval').value, 30) * 1000); }
function setPaused(paused) { state.paused = paused; $('#pause-refresh').innerHTML = paused ? '<span>▶</span> 继续' : '<span>▮▮</span> 暂停'; renderStatus(); scheduleRefresh(); if (!paused) refresh(); }
function setView(view) { const watch = view === 'watch'; $('#watch-view').hidden = !watch; $('#discipline-view').hidden = watch; document.body.classList.toggle('discipline-open', !watch); window.scrollTo({ top: 0, behavior: 'smooth' }); }

$('#add-form').addEventListener('submit', async (event) => { event.preventDefault(); const value = $('#stock-input').value.trim(); if (!value) return; const codeMatch = value.match(/(?:sh|sz|bj)?(\d{6})/i); const item = codeMatch ? { symbol:codeMatch[1], name:'' } : { symbol:`NAME:${value}`, name:value }; const items = localWatchlist(); if (!items.some((saved) => saved.symbol === item.symbol)) { items.push(item); saveWatchlist(items); } $('#stock-input').value = ''; await refresh(); });
$('#discipline-button').addEventListener('click', () => setView('discipline'));
$('#back-watch').addEventListener('click', () => setView('watch'));
$('#refresh-now').addEventListener('click', () => { if (state.paused) setPaused(false); else refresh(); });
$('#pause-refresh').addEventListener('click', () => setPaused(!state.paused));
$('#refresh-interval').addEventListener('change', scheduleRefresh);
$('#close-detail').addEventListener('click', closeDetail);
$('#detail-sheet').addEventListener('click', (event) => { if (event.target === $('#detail-sheet')) closeDetail(); });
$('#remove-detail-stock').addEventListener('click', removeSelected);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeDetail(); });

refresh();
scheduleRefresh();
