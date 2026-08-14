const core = window.TradingCore;
const state = {
  payload: null,
  stocks: [],
  market: null,
  selected: null,
  paused: false,
  refreshing: false,
  stale: false,
  timer: null,
  lastSuccess: null,
  signalCache: new Map()
};

const WATCHLIST_KEY = 'a-share-exit-watchlist';
const API_META = document.querySelector('meta[name="market-api-base"]')?.content || '';
const API_BASE = location.hostname.endsWith('.netlify.app') ? '' : API_META;
const API_URL = `${API_BASE}/api/state`;
const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function codeOf(value) {
  const match = String(value || '').match(/\d{6}/);
  return match ? match[0] : '';
}

function normalizeWatchlist(value) {
  const items = Array.isArray(value) ? value : [];
  const normalized = items.map((item) => {
    const raw = typeof item === 'string' ? item : item?.symbol || item?.name || '';
    const code = codeOf(raw);
    if (code) return code;
    const name = String(raw).replace(/^NAME:/, '').trim();
    return name ? `NAME:${name}` : '';
  }).filter(Boolean);
  return [...new Set(normalized)].slice(0, 30);
}

function loadWatchlist() {
  try {
    return normalizeWatchlist(JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]'));
  } catch {
    return [];
  }
}

function saveWatchlist(items) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(normalizeWatchlist(items)));
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (Math.abs(number) >= 100000000) return `${(number / 100000000).toFixed(2)}亿`;
  if (Math.abs(number) >= 10000) return `${(number / 10000).toFixed(1)}万`;
  return number.toLocaleString('zh-CN');
}

function formatPrice(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number.toFixed(digits) : '—';
}

function formatRatio(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : '—';
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number > 0 ? '+' : ''}${(number * 100).toFixed(2)}%`;
}

function formatTime(value, includeSeconds = true) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: includeSeconds ? '2-digit' : undefined });
}

function trendClass(change) {
  return change > 0.0001 ? 'rise' : change < -0.0001 ? 'fall' : 'flat';
}

function actionIcon(action) {
  if (action === 'clear') return '✕';
  if (action.startsWith('reduce') || action.startsWith('exit')) return '−';
  if (action === 'add' || action === 'd_add') return '↗';
  if (action === 'wait_add') return '⌛';
  if (action === 'warning') return '⚠';
  if (action === 'unavailable') return '○';
  return '▮▮';
}

function signalLabel(signal) {
  return `${actionIcon(signal.action)} ${signal.label}`;
}

function stockKey(stock) {
  return stock.watch_key || stock.symbol || stock.name;
}

function evaluatePayload(payload) {
  const market = payload.market?.data_quality?.valid
    ? core.evaluateMarketEnvironment(payload.market)
    : { status: 'unknown', effectiveStatus: 'unknown', risk: false, highVolume: false, reason: payload.market?.data_quality?.missing?.join('、') || '大盘数据不可用' };
  state.market = market;
  state.stocks = (payload.stocks || []).map((stock) => ({ ...stock, evaluation: core.evaluateInstrument(stock, { market }) }));
}

function migrateResolvedNames() {
  const current = loadWatchlist();
  let changed = false;
  const next = current.map((item) => {
    if (!item.startsWith('NAME:')) return item;
    const stock = state.stocks.find((candidate) => candidate.watch_key === item && codeOf(candidate.symbol));
    if (!stock) return item;
    changed = true;
    return codeOf(stock.symbol);
  });
  if (changed) saveWatchlist(next);
}

function setConnectionStatus(mode, text) {
  const element = $('#data-status');
  element.className = `connection-state ${mode || ''}`.trim();
  element.querySelector('span').textContent = text;
}

function renderHeader() {
  if (state.refreshing) setConnectionStatus('loading', '刷新中...');
  else if (state.paused) setConnectionStatus('paused', '已暂停');
  else if (!state.payload || state.payload.status === 'disconnected') setConnectionStatus('error', '行情未连接');
  else if (state.payload.status === 'partial') setConnectionStatus('warning', '部分行情异常');
  else setConnectionStatus('', '行情已连接');

  $('#header-refresh-time').textContent = state.lastSuccess ? `更新于 ${formatTime(state.lastSuccess)}` : '等待更新';
  const market = state.market;
  const marketText = market?.effectiveStatus === 'bull' ? '大盘多头' : market?.effectiveStatus === 'bear' ? '大盘空头' : market?.effectiveStatus === 'sideways' ? '大盘震荡' : '大盘未确认';
  const marketElement = $('#market-state');
  marketElement.textContent = marketText;
  marketElement.className = `market-state ${market?.effectiveStatus || 'unknown'}`;
  $('#last-refresh').textContent = state.lastSuccess
    ? `${state.stale ? '最后成功数据' : '更新于'} ${new Date(state.lastSuccess).toLocaleString('zh-CN', { hour12: false })} · ${state.payload?.data_source || '云端行情'} · 网页打开时监控`
    : '尚未取得有效行情';
}

function metricPairs(stock) {
  const quote = stock.quote || {};
  const indicators = stock.evaluation?.indicators;
  const digits = indicators?.priceDigits ?? core.priceDigits(core.securityTypeOf(stock.symbol, stock.name, stock.security_type));
  return [
    ['MA5（趋势线）', formatPrice(indicators?.ma5, digits)],
    ['MA10', formatPrice(indicators?.ma10, digits)],
    ['MA20', formatPrice(indicators?.ma20, digits)],
    ['MA60', Number.isFinite(indicators?.ma60) ? formatPrice(indicators.ma60, digits) : '不足60日'],
    [`量比（vs ${indicators?.volumePeriod || '—'}日均量）`, formatRatio(indicators?.volumeRatio)],
    ['成交额', formatNumber(quote.amount)],
    ['今开 / 昨收', `${formatPrice(quote.open, digits)} / ${formatPrice(quote.previous_close, digits)}`],
    ['最高 / 最低', `${formatPrice(quote.high, digits)} / ${formatPrice(quote.low, digits)}`]
  ];
}

function reasonSummary(stock) {
  const evaluation = stock.evaluation;
  const primary = evaluation.primary;
  const secondary = evaluation.secondary || [];
  const details = secondary.map((signal) => signal.title).join(' · ');
  return {
    title: primary.title,
    reason: primary.reason,
    side: `${primary.confirmed ? '已确认' : '待确认'}${details ? ` · ${details}` : ''}`
  };
}

function stockCard(stock) {
  const evaluation = stock.evaluation;
  const signal = evaluation.primary;
  const quote = stock.quote || {};
  const indicators = evaluation.indicators;
  const digits = indicators?.priceDigits ?? core.priceDigits(core.securityTypeOf(stock.symbol, stock.name, stock.security_type));
  const change = Number(quote.previous_close) > 0 ? (Number(quote.price) - Number(quote.previous_close)) / Number(quote.previous_close) : NaN;
  const summary = reasonSummary(stock);
  const metrics = metricPairs(stock).map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  const source = stock.source_label || (stock.source === 'eastmoney' ? '东方财富' : stock.source === 'tencent' ? '腾讯备用' : '无可用来源');
  return `
    <article class="stock-card tone-${escapeHtml(signal.tone)}" data-key="${escapeHtml(stockKey(stock))}" tabindex="0">
      <button class="stock-remove" type="button" data-remove="${escapeHtml(stockKey(stock))}" aria-label="移除${escapeHtml(stock.name)}">×</button>
      <div class="stock-card-title"><strong>${escapeHtml(stock.name || codeOf(stock.symbol) || '未知标的')}</strong><span>${escapeHtml(codeOf(stock.symbol) || stock.symbol || '')}</span></div>
      <div class="stock-quote ${trendClass(change)}"><strong>${formatPrice(quote.price, digits)}</strong><span>${formatPercent(change)}</span><em>${Number.isFinite(change) ? `${change >= 0 ? '+' : ''}${formatPrice(Number(quote.price) - Number(quote.previous_close), digits)}` : '—'}</em></div>
      <button class="stock-action ${escapeHtml(signal.tone)}" type="button">${escapeHtml(signalLabel(signal))}</button>
      <div class="stock-metrics">${metrics}</div>
      <div class="stock-reason-row ${escapeHtml(signal.tone)}"><span><i>i</i><b>${escapeHtml(summary.title)}</b><em>${escapeHtml(summary.reason)}</em></span><strong>${escapeHtml(summary.side)}</strong></div>
      <div class="stock-source">${escapeHtml(source)} · ${escapeHtml(formatTime(stock.source_time))}${stock.data_quality?.fallback ? ' · 已启用备用源' : ''}</div>
    </article>`;
}

function renderWatchlist() {
  const container = $('#watchlist');
  const watchlist = loadWatchlist();
  if (!watchlist.length) {
    container.className = 'stock-list empty-state';
    container.innerHTML = '<strong>还没有自选股</strong><span>输入6位股票或ETF代码开始盯盘</span>';
    return;
  }
  container.className = 'stock-list';
  if (!state.stocks.length) {
    container.innerHTML = watchlist.map((item) => {
      const code = codeOf(item) || item.replace(/^NAME:/, '');
      return `<article class="stock-card tone-unavailable"><button class="stock-remove" type="button" data-remove="${escapeHtml(item)}">×</button><div class="stock-card-title"><strong>${escapeHtml(code)}</strong></div><div class="stock-quote flat"><strong>—</strong><span>等待行情</span></div><button class="stock-action unavailable" type="button">○ 待连接</button><div class="stock-reason-row unavailable"><span><i>i</i><b>行情连接</b><em>等待云端行情网关返回数据</em></span><strong>停止判断</strong></div></article>`;
    }).join('');
    return;
  }
  container.innerHTML = state.stocks.map(stockCard).join('');
}

function renderDiscipline() {
  $('#discipline-content').innerHTML = core.DISCIPLINE_SECTIONS.map((section) => `
    <article class="discipline-card">
      <h2>${escapeHtml(section.title)}</h2>
      ${section.groups.map((group) => `<section><h3>${escapeHtml(group.title)}</h3><ul>${group.items.map(([title, text]) => `<li><b>${escapeHtml(title)}：</b>${escapeHtml(text)}</li>`).join('')}</ul></section>`).join('')}
      ${section.notes.map(([title, text]) => `<p><b>${escapeHtml(title)}：</b>${escapeHtml(text)}</p>`).join('')}
    </article>`).join('');
}

function render() {
  renderHeader();
  renderWatchlist();
}

function selectedStock() {
  return state.stocks.find((stock) => stockKey(stock) === state.selected || stock.symbol === state.selected);
}

function renderDetail(stock) {
  const evaluation = stock.evaluation;
  const signal = evaluation.primary;
  const quote = stock.quote || {};
  const digits = evaluation.indicators?.priceDigits ?? 2;
  const change = Number(quote.previous_close) > 0 ? (Number(quote.price) - Number(quote.previous_close)) / Number(quote.previous_close) : NaN;
  $('#detail-code').textContent = codeOf(stock.symbol) || stock.symbol || '—';
  $('#detail-name').textContent = stock.name || '未知标的';
  const decision = $('#detail-decision');
  decision.className = `decision-card ${signal.tone}`;
  decision.textContent = `${signalLabel(signal)} · ${signal.reason}`;
  $('#detail-price').textContent = formatPrice(quote.price, digits);
  $('#detail-change').textContent = formatPercent(change);
  $('#detail-change').className = trendClass(change);
  $('#detail-action').textContent = signal.label;
  $('#detail-metrics').innerHTML = metricPairs(stock).map(([label, value]) => `<div class="metric-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  $('#detail-source').textContent = `${stock.source_label || '无可用来源'} · 行情时间 ${formatTime(stock.source_time)} · ${signal.confirmed ? '信号已确认' : '盘中动态/待确认'}`;
  $('#detail-reasons').innerHTML = [signal, ...(evaluation.secondary || [])].map((item) => `<div class="reason-row ${escapeHtml(item.tone)}"><i class="reason-dot"></i><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.reason)}</span></div></div>`).join('');
}

function openDetail(key) {
  const stock = state.stocks.find((candidate) => stockKey(candidate) === key || candidate.symbol === key);
  if (!stock) return;
  state.selected = stockKey(stock);
  renderDetail(stock);
  $('#detail-sheet').classList.add('open');
  $('#detail-sheet').setAttribute('aria-hidden', 'false');
}

function closeDetail() {
  $('#detail-sheet').classList.remove('open');
  $('#detail-sheet').setAttribute('aria-hidden', 'true');
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3800);
}

function announceSignals() {
  for (const stock of state.stocks) {
    const signal = stock.evaluation.primary;
    if (!core.shouldAnnounce(state.signalCache, codeOf(stock.symbol) || stock.symbol, signal)) continue;
    const banner = $('#alert-banner');
    banner.className = `alert-banner ${signal.tone}`;
    banner.innerHTML = `<b>${escapeHtml(stock.name)} · ${escapeHtml(signal.label)}</b><span>${escapeHtml(signal.title)}：${escapeHtml(signal.reason)}</span>`;
    showToast(`${signal.label}：${stock.name} · ${signal.title}`);
  }
}

async function fetchWithTimeout(url, timeoutMs = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`云端行情 HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function refresh() {
  if (state.refreshing || state.paused) return;
  state.refreshing = true;
  state.stale = false;
  renderHeader();
  const watchlist = loadWatchlist();
  try {
    const query = encodeURIComponent(JSON.stringify(watchlist));
    const payload = await fetchWithTimeout(`${API_URL}?watchlist=${query}&_=${Date.now()}`);
    if (!Array.isArray(payload.stocks)) throw new Error(payload.error || '云端返回格式无效');
    state.payload = payload;
    state.lastSuccess = payload.generated_at || new Date().toISOString();
    evaluatePayload(payload);
    migrateResolvedNames();
    render();
    announceSignals();
    const selected = selectedStock();
    if (selected && $('#detail-sheet').classList.contains('open')) renderDetail(selected);
  } catch (error) {
    state.stale = true;
    if (!state.payload) state.payload = { status: 'disconnected', data_source: '云端行情' };
    render();
    showToast(error?.name === 'AbortError' ? '云端行情请求超时' : (error?.message || '行情连接失败'));
  } finally {
    state.refreshing = false;
    renderHeader();
  }
}

function scheduleRefresh() {
  clearInterval(state.timer);
  if (!state.paused) state.timer = setInterval(refresh, Number($('#refresh-interval').value || 30) * 1000);
}

function setPaused(paused) {
  state.paused = paused;
  $('#pause-refresh').innerHTML = paused ? '<span>▶</span> 继续' : '<span>▮▮</span> 暂停';
  scheduleRefresh();
  renderHeader();
  if (!paused) refresh();
}

function removeStock(key) {
  const stock = state.stocks.find((candidate) => stockKey(candidate) === key || candidate.symbol === key);
  const code = codeOf(stock?.symbol || key);
  const next = loadWatchlist().filter((item) => item !== key && (!code || codeOf(item) !== code));
  saveWatchlist(next);
  state.stocks = state.stocks.filter((candidate) => stockKey(candidate) !== key && (!code || codeOf(candidate.symbol) !== code));
  closeDetail();
  render();
  refresh();
}

function setView(view) {
  const watch = view === 'watch';
  $('#watch-view').hidden = !watch;
  $('#discipline-view').hidden = watch;
  document.body.classList.toggle('discipline-open', !watch);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('#add-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#stock-input');
  const raw = input.value.trim();
  if (!raw) return;
  const code = codeOf(raw);
  const item = code || `NAME:${raw}`;
  const current = loadWatchlist();
  if (current.includes(item) || (code && current.some((entry) => codeOf(entry) === code))) {
    showToast('该标的已经在自选中');
    return;
  }
  saveWatchlist([...current, item]);
  input.value = '';
  render();
  refresh();
});

$('#watchlist').addEventListener('click', (event) => {
  const remove = event.target.closest('[data-remove]');
  if (remove) {
    event.stopPropagation();
    removeStock(remove.dataset.remove);
    return;
  }
  const card = event.target.closest('[data-key]');
  if (card) openDetail(card.dataset.key);
});

$('#watchlist').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    const card = event.target.closest('[data-key]');
    if (card) openDetail(card.dataset.key);
  }
});

$('#remove-detail-stock').addEventListener('click', () => state.selected && removeStock(state.selected));
$('#close-detail').addEventListener('click', closeDetail);
$('#detail-sheet').addEventListener('click', (event) => { if (event.target.id === 'detail-sheet') closeDetail(); });
$('#discipline-button').addEventListener('click', () => setView('discipline'));
$('#back-watch').addEventListener('click', () => setView('watch'));
$('#refresh-now').addEventListener('click', refresh);
$('#pause-refresh').addEventListener('click', () => setPaused(!state.paused));
$('#refresh-interval').addEventListener('change', scheduleRefresh);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !state.paused) refresh(); });

renderDiscipline();
render();
scheduleRefresh();
refresh();
