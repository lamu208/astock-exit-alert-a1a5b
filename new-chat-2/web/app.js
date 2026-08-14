const state = { data: null, selected: null, seen: new Set(), paused: false, timer: null };
const localWatchlistKey = 'a-share-exit-watchlist';
const $ = (selector) => document.querySelector(selector);
const localWatchlist = () => { try { const value = JSON.parse(localStorage.getItem(localWatchlistKey) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
const saveWatchlist = (items) => localStorage.setItem(localWatchlistKey, JSON.stringify(items));
const stockKey = (stock) => stock.watch_key || (String(stock.symbol || '').startsWith('NAME:') ? stock.symbol : (stock.name ? `NAME:${stock.name}` : stock.symbol));
const watchlistQuery = () => encodeURIComponent(JSON.stringify(localWatchlist()));
const accessToken = new URLSearchParams(location.search).get('token') || localStorage.getItem('exit-alert-token') || '';
if (accessToken) localStorage.setItem('exit-alert-token', accessToken);

const levelOrder = { none: 0, blue: 1, yellow: 2, orange: 3, red: 4 };
const levelText = { none: '持有', blue: '注意', yellow: '警示', orange: '减仓', red: '离场' };
const actionText = { add: '加仓', hold: '持有观望', warning: '警示信号', reduce_30_50: '减仓30%-50%', hold_no_sell: '不卖', stop_loss: '止损减仓', d_add: 'D档加仓', reduce_50_60: '减仓50%-60%', exit_60_70: '出60%-70%', clear: '清仓', reduce: '减仓' };

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
function actionMessage(action) { if (action === 'clear') return '执行立即清仓纪律'; if (action === 'exit_60_70') return '执行出 60%～70% 纪律'; if (action === 'reduce_50_60') return '执行减仓 50%～60% 纪律'; if (['reduce_30_50', 'stop_loss', 'reduce'].includes(action)) return '执行分批减仓纪律'; if (action === 'warning') return '警示信号，按优先级观察'; if (action === 'hold_no_sell') return '不卖，继续观察'; if (['add', 'd_add'].includes(action)) return '符合计划加仓条件'; return '当前按纪律持有观察'; }
function actionButtonText(action, unavailable) { if (unavailable) return '待连接'; if (action === 'clear') return '✕ 清仓'; if (action === 'exit_60_70') return '− 出60%-70%'; if (['reduce_30_50', 'reduce_50_60', 'stop_loss', 'reduce'].includes(action)) return '− 出一部分'; if (action === 'warning') return '⚠ 警示观察'; if (action === 'hold_no_sell') return '▮▮ 不卖观察'; if (action === 'd_add') return '＋ D档加仓'; if (action === 'add') return '＋ 加仓'; return '▮▮ 持有观望'; }
function actionTone(action, unavailable) { if (unavailable) return 'unavailable'; if (action === 'clear') return 'clear'; if (['exit_60_70', 'reduce_30_50', 'reduce_50_60', 'stop_loss', 'reduce'].includes(action)) return 'reduce'; if (action === 'warning') return 'warning'; if (['add', 'd_add'].includes(action)) return 'add'; return 'hold'; }
function topRule(stock) { return [...(stock.rules || [])].sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))[0]; }
function stockReason(stock, action, unavailable) {
  if (unavailable) return { text: stock.quote?.error || '行情暂不可用', summary: '等待行情连接' };
  const rule = topRule(stock);
  if (!rule) return { text: '未触发加仓、减仓或离场条件，按纪律持有观察', summary: '趋势完整：持有观望' };
  let layer = '量价信号';
  if (['clear', 'exit_60_70'].includes(action)) layer = '第五层：趋势反转→离场';
  else if (['reduce_30_50', 'reduce_50_60', 'stop_loss', 'reduce'].includes(action)) layer = '第三层：趋势破坏→减仓';
  else if (action === 'warning') layer = '第一层：量价→警示';
  else if (['add', 'd_add'].includes(action)) layer = '入场信号：按档加仓';
  else if (action === 'hold_no_sell') layer = '第一层：缩量破位→不卖';
  else layer = '趋势完整：持有观望';
  return { text: rule.reason || rule.title || actionMessage(action), summary: layer };
}

function renderStatus() {
  const status = $('#data-status'); const stocks = state.data?.stocks || [];
  const live = stocks.filter((stock) => stock.quote.data_status === 'live').length;
  const demo = stocks.filter((stock) => stock.quote.data_status === 'demo').length;
  if (state.paused) { status.className = 'connection-state paused'; status.innerHTML = '<i></i><span>已暂停</span>'; }
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
      <div class="stock-reason-row ${actionToneName}"><span><i>i</i><b>${escapeHtml(topRule(stock)?.title || (unavailable ? '行情连接' : '纪律判断'))}</b><em>${escapeHtml(reason.text)}</em></span><strong>${escapeHtml(reason.summary)}</strong></div>
    </article>`;
  }).join('');
  host.querySelectorAll('.stock-card').forEach((card) => card.addEventListener('click', (event) => { if (!event.target.closest('button')) openDetail(card.dataset.symbol); }));
  host.querySelectorAll('.stock-action').forEach((button) => button.addEventListener('click', (event) => openDetail(event.currentTarget.closest('.stock-card').dataset.symbol)));
  host.querySelectorAll('.stock-remove').forEach((button) => button.addEventListener('click', async (event) => { event.stopPropagation(); await removeStock(button.dataset.remove); }));
}

function renderDetail(stock) {
  const quote = stock.quote; const unavailable = quote.data_status === 'unavailable'; const action = unavailable ? 'hold' : actionFor(stock); const change = unavailable ? 0 : changeOf(quote); const decision = unavailable ? '行情暂不可用' : `${actionText[action]} · ${actionMessage(action)}`;
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
    const response = await apiFetch(`/api/state?watchlist=${watchlistQuery()}`); if (!response.ok) throw new Error(`HTTP ${response.status}`); state.data = await response.json(); render();
    const time = new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }); $('#header-refresh-time').textContent = `更新于 ${time}`; $('#last-refresh').textContent = `更新于 ${time} · ${state.data.data_source || '云端公开行情'}`;
    [...(state.data.alerts || [])].sort((a, b) => levelOrder[b.level] - levelOrder[a.level]).forEach(announce);
  } catch { $('#data-status').className = 'connection-state error'; $('#data-status').innerHTML = '<i></i><span>刷新失败</span>'; showToast('刷新失败，请稍后重试'); }
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
