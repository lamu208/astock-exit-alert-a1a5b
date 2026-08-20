(function attachTradingCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TradingCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createTradingCore() {
  const ACTIONS = {
    unavailable: { label: '数据不可用', tone: 'unavailable', priority: -1 },
    hold: { label: '持有观望', tone: 'hold', priority: 100 },
    hold_no_sell: { label: '不卖观察', tone: 'hold', priority: 120 },
    add: { label: '建议加仓', tone: 'add', priority: 400 },
    d_add: { label: 'D档加仓', tone: 'add', priority: 390 },
    warning: { label: '警示观察', tone: 'warning', priority: 500 },
    reduce_30: { label: '减仓30%', tone: 'reduce', priority: 710 },
    reduce_30_50: { label: '减仓30%-50%', tone: 'reduce', priority: 760 },
    reduce_50_60: { label: '减仓50%-60%', tone: 'reduce', priority: 820 },
    exit_60_70: { label: '出60%-70%', tone: 'reduce', priority: 880 },
    clear: { label: '立即清仓', tone: 'clear', priority: 1000 }
  };

  const EXIT_PRIORITIES = {
    extremeUpper: 980,
    pairedTop: 880,
    warningPatternVolume: 820,
    structureBreak: 800,
    ma20Break: 760,
    ma10Break: 735,
    ma5Break: 710,
    trendWarning: 540,
    shrinkObserve: 180
  };

  const ENTRY_PRIORITIES = {
    pullbackConfirmed: 470,
    trendBreakout: 450,
    reversal: 430,
    oversold: 410,
    dAdd: 390
  };

  const VOLUME_PRICE_PRIORITIES = {
    stagnation: 520,
    fallingShrink: 170,
    risingShrink: 160
  };

  const DISCIPLINE_SECTIONS = [
    {
      title: '💡 入场四模式 · 金字塔加仓 · 五层递进离场',
      groups: [
        {
          title: '1. 入场模式',
          items: [
            ['① 趋势突破', '突破20日新高 + 放量（1.3～1.8倍） + MA5>MA10>MA20；若同时放量突破BOLL上轨、上轨向上且带宽扩大，突破有效性增强'],
            ['② 回踩确认', '缩量回踩MA10/MA20 + 锤子线/吞没 + 重新转强（优先级最高）；若MA10/MA20与BOLL中轨形成共振支撑，优先加仓'],
            ['③ 反转形态', '早晨星 + 反弹突破前高 + 放量改善；若在BOLL下轨附近止跌并重新站回中轨，反转确认增强'],
            ['④ 超跌反弹', '股价超跌 + 下跌衰减 + 板块企稳（仅≤20%小仓）；跌破BOLL下轨后快速收回且下跌量能衰减，可增强信号，触碰下轨不得单独作为买点']
          ]
        },
        {
          title: '2. 加仓金字塔',
          items: [
            ['第1档（30%-40%）', '初始突破建立底仓'],
            ['第2档（20%-30%）', '缩量回踩支撑 + 止跌确认；MA10/MA20与BOLL中轨共振支撑时优先执行'],
            ['第3档（10%-20%）', '放量突破前高 + 多头排列保持；沿BOLL上轨向上运行或带宽扩张时，趋势确认增强']
          ]
        },
        {
          title: '3. 离场五层递进',
          items: [
            ['① 动能减弱｜观察', '缩量跌破MA5 → 正常回踩，观察不卖｜放量跌破且未收回MA5 → 减仓约30%；BOLL中轨仍向上且未破坏时可降低短期警报等级'],
            ['② 趋势转弱｜警戒', '缩量跌破MA10 → 暂不动作，观察能否快速收回｜放量跌破MA10 → 提高警戒；同时跌破BOLL中轨时确认增强'],
            ['③ 趋势破坏｜减仓', '放量跌破MA20 → 减仓30%-50%｜缩量跌破 → 先观察｜连续无法收回MA20 → 按趋势破坏处理；BOLL中轨同步跌破且带宽向下扩张时提高优先级'],
            ['④ 结构破坏｜继续减仓', '放量跌破前期突破平台/关键支撑 → 继续减仓｜对子顶 + 放量 → 出60%-70%｜大阳线后放量长上影 → 减仓50%-60%；同步跌破BOLL下轨时确认增强'],
            ['⑤ 趋势反转｜清仓', 'MA5下穿MA10/MA20且股价持续运行于MA20下方 → 原则上清仓｜关键平台放量有效跌破且无法快速收回 → 清仓｜极端放量长上影或明显见顶结构 → 立即清仓；BOLL中轨向下、下轨向下扩张且股价持续位于中轨下方时确认增强']
          ]
        }
      ],
      notes: [
        ['核心原则', '趋势优先 → 量价确认 → 回踩优先 → BOLL辅助确认 → 分批建仓 → 上涨加仓 → 破位减仓'],
        ['禁止追高', '连续3+根大阳线｜股价距离MA20超10%-12%｜放巨量长上影｜个股涨但板块弱｜大盘高位放量']
      ]
    },
    {
      title: '📊 BOLL布林带辅助纪律',
      groups: [
        {
          title: '核心定位',
          items: [
            ['执行边界', 'BOLL只负责趋势、回踩、过热或超跌的辅助确认，不单独决定买卖'],
            ['强趋势', '股价沿BOLL上轨运行 + 上轨持续向上 + 带宽扩大 → 强趋势持有；触碰上轨不等于卖出'],
            ['最佳回踩', '上涨趋势中缩量回踩BOLL中轨，且MA10/MA20与中轨共振、出现止跌K线并重新转强 → 高优先级回踩加仓'],
            ['高位风险', '股价明显冲出BOLL上轨，同时放量并出现长上影或滞涨 → 资金兑现风险增强，按原离场纪律减仓'],
            ['超跌判断', '跌破BOLL下轨后快速收回，同时下跌量能衰减且支撑企稳 → 超跌反弹信号增强，仅允许小仓参与'],
            ['趋势风险', '放量跌破BOLL中轨且同步跌破MA5/MA10 → 减仓信号增强｜放量跌破下轨且MA20或关键平台同步破位 → 高级别趋势破坏']
          ]
        },
        {
          title: 'BOLL禁止误判',
          items: [
            ['触碰上轨', '不等于卖出'],
            ['触碰下轨', '不等于买入'],
            ['突破上轨', '不等于一定超买'],
            ['跌破下轨', '不等于一定超卖']
          ]
        }
      ],
      notes: [
        ['组合使用', 'BOLL必须结合趋势线、成交量、K线和关键支撑使用，绝不允许BOLL单独触发买卖']
      ]
    },
    {
      title: '⚖️ 量价关系与决策优先级',
      groups: [
        {
          title: '1. 量价关系判断',
          items: [
            ['上涨放量', '趋势确认；仅在满足四种入场模式时执行加仓'],
            ['上涨缩量', '可持有，不追高'],
            ['下跌缩量', '正常回踩，观察支撑'],
            ['放量滞涨', '警惕高位换手'],
            ['放量长上影', '警惕资金兑现'],
            ['放量跌破MA20', '趋势风险，减仓30%-50%']
          ]
        },
        {
          title: '2. 破位后的重新加仓',
          items: [
            ['反弹补仓', '破位减仓后2-3根K线不创新低 + 缩量企稳 + 重新站回趋势线 → 可考虑D档补仓'],
            ['BOLL增强', '重新站回BOLL中轨且中轨重新向上 → 补仓信号进一步增强'],
            ['禁止条件', '没有重新站回趋势线或BOLL中轨，不得仅因跌幅较大而补仓']
          ]
        },
        {
          title: '3. 决策优先级',
          items: [
            ['总优先级', '量能 + MA趋势线 ＞ 关键支撑 ＞ BOLL ＞ K线形态 ＞ 盘口'],
            ['①', '放量跌破趋势线或关键支撑 → 优先减仓'],
            ['②', '趋势线完整 → 判断BOLL位置与方向'],
            ['③', 'MA10/MA20与BOLL中轨共振 → 提高回踩信号等级'],
            ['④', '长上影或对子顶等警示 → 判断是否伴随放量'],
            ['⑤', 'K线警示 + 放量 + BOLL异常 → 提高离场等级'],
            ['⑥', '无破位、无放量警示 → 持有为主，不因单根K线或单独触碰BOLL上下轨操作']
          ]
        }
      ],
      notes: [
        ['程序近似', 'MA5=短期主趋势线｜MA10=趋势警戒线｜MA20=趋势生命线｜BOLL中轨=动态趋势/回踩辅助线｜5日均量=成交量基准'],
        ['执行约束', '离场优先判断“量能 + MA趋势线”，BOLL只负责增强或降低信号等级，绝不单独触发买卖']
      ]
    }
  ];

  function finiteNumber(value, fallback = NaN) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function round(value, digits = 4) {
    if (!Number.isFinite(value)) return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function symbolDigits(value) {
    const match = String(value || '').match(/\d{6}/);
    return match ? match[0] : '';
  }

  function securityTypeOf(symbol, name = '', explicitType = '') {
    if (String(explicitType).toUpperCase() === 'ETF') return 'ETF';
    const code = symbolDigits(symbol);
    return /ETF|LOF|基金/i.test(name) || /^(15|16|50|51|52|56|58|59)\d{4}$/.test(code) ? 'ETF' : 'STOCK';
  }

  function priceDigits(securityType) {
    return securityType === 'ETF' ? 3 : 2;
  }

  function tradingProgress(sourceTime) {
    const date = sourceTime instanceof Date ? sourceTime : new Date(sourceTime || Date.now());
    if (Number.isNaN(date.getTime())) return 1;
    const day = date.getDay();
    if (day === 0 || day === 6) return 1;
    const minutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
    if (minutes < 570 || minutes >= 900) return 1;
    if (minutes <= 690) return Math.max((minutes - 570) / 240, 0.02);
    if (minutes < 780) return 0.5;
    return Math.min(0.5 + (minutes - 780) / 240, 1);
  }

  function isTradingSession(sourceTime) {
    const date = sourceTime instanceof Date ? sourceTime : new Date(sourceTime || Date.now());
    if (Number.isNaN(date.getTime()) || date.getDay() === 0 || date.getDay() === 6) return false;
    const minutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
    return (minutes >= 570 && minutes <= 690) || (minutes >= 780 && minutes < 900);
  }

  function normalizeBar(bar) {
    const close = finiteNumber(bar?.close);
    const open = finiteNumber(bar?.open, close);
    const high = finiteNumber(bar?.high, Math.max(open, close));
    const low = finiteNumber(bar?.low, Math.min(open, close));
    return {
      date: String(bar?.date || ''),
      open,
      close,
      high,
      low,
      volume: finiteNumber(bar?.volume, 0),
      amount: finiteNumber(bar?.amount, 0)
    };
  }

  function validBar(bar) {
    return [bar.open, bar.close, bar.high, bar.low].every((value) => Number.isFinite(value) && value > 0)
      && bar.high >= Math.max(bar.open, bar.close, bar.low)
      && bar.low <= Math.min(bar.open, bar.close, bar.high)
      && Number.isFinite(bar.volume)
      && bar.volume >= 0;
  }

  function dateKey(value) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function sameQuoteBar(left, right, securityType) {
    const tolerance = 10 ** -priceDigits(securityType) / 2 + Number.EPSILON;
    return ['open', 'close', 'high', 'low'].every((field) => {
      const leftValue = finiteNumber(left?.[field]);
      const rightValue = finiteNumber(right?.[field]);
      return Number.isFinite(leftValue)
        && Number.isFinite(rightValue)
        && Math.abs(leftValue - rightValue) <= tolerance;
    });
  }

  function buildSeries(marketData) {
    const quote = marketData.quote || {};
    const securityType = securityTypeOf(marketData.symbol, marketData.name, marketData.security_type);
    const barsByDate = new Map();
    (marketData.daily_bars || []).map(normalizeBar).filter(validBar).forEach((bar) => {
      const rawDate = String(bar.date || '');
      const normalizedDate = /^\d{4}-\d{2}-\d{2}/.test(rawDate) ? rawDate.slice(0, 10) : dateKey(rawDate);
      if (normalizedDate) barsByDate.set(normalizedDate, { ...bar, date: normalizedDate });
    });
    const bars = [...barsByDate.values()].sort((left, right) => left.date.localeCompare(right.date));
    const sourceDate = dateKey(marketData.source_time || marketData.fetched_at);
    const current = normalizeBar({
      date: sourceDate,
      open: quote.open,
      close: quote.price,
      high: quote.high,
      low: quote.low,
      volume: quote.volume,
      amount: quote.amount
    });
    if (!validBar(current)) return bars;
    const last = bars.at(-1);
    const matchesLastTradingBar = last && sameQuoteBar(last, current, securityType);
    if (last && last.date && sourceDate && (last.date === sourceDate || matchesLastTradingBar)) {
      bars[bars.length - 1] = {
        ...current,
        date: last.date,
        volume: Number.isFinite(last.volume) && last.volume > 0 ? last.volume : current.volume,
        amount: Number.isFinite(last.amount) && last.amount > 0 ? last.amount : current.amount
      };
    }
    else bars.push(current);
    return bars;
  }

  function average(values) {
    const validValues = values.filter(Number.isFinite);
    return validValues.length ? validValues.reduce((sum, value) => sum + value, 0) / validValues.length : NaN;
  }

  function movingAverage(bars, period, offset = 0) {
    const end = bars.length - offset;
    const start = end - period;
    if (start < 0) return NaN;
    return average(bars.slice(start, end).map((bar) => bar.close));
  }

  function bollingerBands(bars, period = 20, multiplier = 2, offset = 0) {
    const end = bars.length - offset;
    const start = end - period;
    if (start < 0) {
      return { middle: NaN, upper: NaN, lower: NaN, bandwidth: NaN, deviation: NaN };
    }
    const closes = bars.slice(start, end).map((bar) => bar.close).filter(Number.isFinite);
    if (closes.length !== period) {
      return { middle: NaN, upper: NaN, lower: NaN, bandwidth: NaN, deviation: NaN };
    }
    const middle = average(closes);
    const variance = average(closes.map((close) => (close - middle) ** 2));
    const deviation = Math.sqrt(variance);
    const upper = middle + multiplier * deviation;
    const lower = middle - multiplier * deviation;
    return {
      middle,
      upper,
      lower,
      bandwidth: middle > 0 ? (upper - lower) / middle : NaN,
      deviation
    };
  }

  function averageVolume(bars, period, excludeCurrent = true) {
    const end = bars.length - (excludeCurrent ? 1 : 0);
    const start = end - period;
    if (start < 0) return NaN;
    return average(bars.slice(start, end).map((bar) => bar.volume));
  }

  function relativeStrengthIndex(bars, period = 14) {
    if (bars.length <= period) return NaN;
    let gains = 0;
    let losses = 0;
    const sample = bars.slice(-(period + 1));
    for (let index = 1; index < sample.length; index += 1) {
      const change = sample[index].close - sample[index - 1].close;
      if (change >= 0) gains += change;
      else losses -= change;
    }
    if (losses === 0) return gains === 0 ? 50 : 100;
    const strength = (gains / period) / (losses / period);
    return 100 - 100 / (1 + strength);
  }

  function candleShape(bar, securityType = 'STOCK') {
    const body = Math.abs(bar.close - bar.open);
    const safeBody = Math.max(body, bar.close * 0.000001);
    const upper = Math.max(0, bar.high - Math.max(bar.open, bar.close));
    const lower = Math.max(0, Math.min(bar.open, bar.close) - bar.low);
    const bigBullThreshold = securityType === 'ETF' ? 0.02 : 0.03;
    const upperRatio = securityType === 'ETF' ? 1.5 : 2;
    return {
      body,
      upper,
      lower,
      bullish: bar.close > bar.open,
      bearish: bar.close < bar.open,
      bigBull: bar.open > 0 && bar.close > bar.open && (bar.close - bar.open) / bar.open >= bigBullThreshold,
      longUpper: upper > safeBody * upperRatio,
      extremeUpper: upper > safeBody * 3 && upper > bar.close * 0.03,
      hammer: lower > safeBody * 2 && upper < safeBody * 0.5,
      doji: body < bar.close * 0.003
    };
  }

  function isBullishEngulfing(previous, current) {
    return Boolean(previous && current
      && previous.close < previous.open
      && current.close > current.open
      && current.close > previous.open
      && current.open < previous.close);
  }

  function isMorningStar(bars, securityType) {
    if (bars.length < 3) return false;
    const [first, middle, last] = bars.slice(-3);
    const firstBody = Math.abs(first.close - first.open);
    const middleBody = Math.abs(middle.close - middle.open);
    const firstDrop = first.open > 0 ? (first.open - first.close) / first.open : 0;
    const lastThreshold = securityType === 'ETF' ? 0.02 : 0.03;
    const lastRise = last.open > 0 ? (last.close - last.open) / last.open : 0;
    return first.close < first.open
      && firstDrop >= 0.02
      && middleBody < firstBody * 0.5
      && last.close > last.open
      && lastRise >= Math.min(0.02, lastThreshold)
      && last.close > (first.open + first.close) / 2;
  }

  function isPairedPriceTop(value, securityType = 'STOCK') {
    if (!Number.isFinite(value) || value <= 0) return false;
    const decimals = value.toFixed(priceDigits(securityType)).split('.')[1] || '';
    if (decimals.length < 2) return false;
    const pair = decimals.slice(-2);
    return pair !== '00' && pair[0] === pair[1];
  }

  function detectPairedPriceTop(bars, securityType = 'STOCK') {
    const none = { active: false, confirmed: false };
    if (!Array.isArray(bars) || bars.length < 6) return none;

    const lastIndex = bars.length - 1;
    const candidate = bars[lastIndex];
    if (!isPairedPriceTop(candidate.high, securityType)) return none;

    const prior = bars.slice(0, lastIndex);
    const shape = candleShape(candidate, securityType);
    if (!shape.longUpper || shape.doji) return none;

    const priorHistoricalHigh = Math.max(...prior.map((bar) => bar.high).filter(Number.isFinite));
    const recentLow = Math.min(...prior.slice(-60).map((bar) => bar.low).filter(Number.isFinite));
    const strictHistoricalHigh = Number.isFinite(priorHistoricalHigh) && candidate.high > priorHistoricalHigh;
    const clearPriorRise = Number.isFinite(recentLow) && recentLow > 0 && candidate.high / recentLow - 1 >= 0.1;
    if (!strictHistoricalHigh || !clearPriorRise) return none;

    const baselineVolume = average(prior.slice(-5).map((bar) => bar.volume));
    const volumeRatio = baselineVolume > 0 ? candidate.volume / baselineVolume : NaN;
    const volumeConfirmed = volumeRatio >= 1.3;
    if (!volumeConfirmed) return none;

    return {
      active: true,
      confirmed: true,
      price: candidate.high,
      age: 0,
      volumeRatio,
      volumeConfirmed,
      longUpper: true,
      doji: false,
      strictHistoricalHigh,
      priorHistoricalHigh,
      riseFromRecentLow: candidate.high / recentLow - 1
    };
  }

  function sustainedBelowMovingAverage(bars, period, count = 3) {
    if (!Array.isArray(bars) || bars.length < period + count) return false;
    for (let offset = 0; offset < count; offset += 1) {
      const bar = bars.at(-(offset + 1));
      const line = movingAverage(bars, period, offset);
      if (!bar || !Number.isFinite(line) || bar.close >= line) return false;
    }
    return true;
  }

  function consecutiveLowerLowsAfterMa5Break(bars, count = 3) {
    if (!Array.isArray(bars) || bars.length < 8 || count < 2) return false;
    const sample = bars.slice(-count);
    const lowerLows = sample.slice(1).every((bar, index) => bar.low < sample[index].low * 0.998);
    const hadBreak = sample.some((bar, index) => {
      const offset = sample.length - index - 1;
      const line = movingAverage(bars, 5, offset);
      return Number.isFinite(line) && bar.close < line;
    });
    return lowerLows && hadBreak;
  }

  function volumeLevel(ratio) {
    if (!Number.isFinite(ratio) || ratio < 0) return '未知';
    if (ratio <= 0.8) return '缩量';
    if (ratio < 1.3) return '平量';
    if (ratio < 1.8) return '放量';
    if (ratio < 2.5) return '强放量';
    return '放巨量';
  }

  function calculateIndicators(marketData) {
    const securityType = securityTypeOf(marketData.symbol, marketData.name, marketData.security_type);
    const series = buildSeries(marketData);
    const quote = marketData.quote || {};
    const current = series.at(-1);
    const prior = series.slice(0, -1);
    const volumePeriod = 5;
    const baselineVolume = averageVolume(series, volumePeriod, true);
    const progress = isTradingSession(marketData.source_time) ? tradingProgress(marketData.source_time) : 1;
    const projectedVolume = current ? current.volume : NaN;
    const volumeRatio = baselineVolume > 0 && current ? current.volume / baselineVolume : NaN;
    const volumeConfirmationRatio = volumeRatio;
    const historicalMaxVolume = prior.length ? Math.max(...prior.map((bar) => bar.volume)) : NaN;
    const historicalVolumeHigh = Boolean(current
      && current.volume > 0
      && historicalMaxVolume > 0
      && current.volume > historicalMaxVolume);
    const volumeConfirmed = volumeRatio >= 1.3;
    const ma5 = movingAverage(series, 5);
    const ma10 = movingAverage(series, 10);
    const ma20 = movingAverage(series, 20);
    const ma60 = movingAverage(series, 60);
    const previousMa5 = movingAverage(series, 5, 1);
    const previousMa10 = movingAverage(series, 10, 1);
    const previousMa20 = movingAverage(series, 20, 1);
    const boll = bollingerBands(series);
    const previousBoll = bollingerBands(series, 20, 2, 1);
    const previousHigh20 = prior.length >= 20 ? Math.max(...prior.slice(-20).map((bar) => bar.high)) : NaN;
    const previousLow20 = prior.length >= 20 ? Math.min(...prior.slice(-20).map((bar) => bar.low)) : NaN;
    const change = finiteNumber(quote.previous_close ?? quote.prev_close) > 0
      ? (finiteNumber(quote.price) - finiteNumber(quote.previous_close ?? quote.prev_close)) / finiteNumber(quote.previous_close ?? quote.prev_close)
      : NaN;
    return {
      securityType,
      priceDigits: priceDigits(securityType),
      series,
      current,
      prior,
      ma5,
      ma10,
      ma20,
      ma60,
      previousMa5,
      previousMa10,
      previousMa20,
      bollMiddle: boll.middle,
      bollUpper: boll.upper,
      bollLower: boll.lower,
      bollBandwidth: boll.bandwidth,
      previousBollMiddle: previousBoll.middle,
      previousBollUpper: previousBoll.upper,
      previousBollLower: previousBoll.lower,
      previousBollBandwidth: previousBoll.bandwidth,
      bollMiddleRising: boll.middle > previousBoll.middle,
      bollUpperRising: boll.upper > previousBoll.upper,
      bollLowerFalling: boll.lower < previousBoll.lower,
      bollBandwidthExpanding: boll.bandwidth > previousBoll.bandwidth,
      previousHigh20,
      previousLow20,
      volumePeriod,
      baselineVolume,
      projectedVolume,
      volumeRatio,
      volumeLevel: volumeLevel(volumeRatio),
      volumeConfirmationRatio,
      historicalMaxVolume,
      historicalVolumeHigh,
      volumeConfirmed,
      marketProgress: progress,
      change,
      rsi14: relativeStrengthIndex(series, 14),
      deviationMa20: ma20 > 0 && current ? current.close / ma20 - 1 : NaN,
      bullishAlignment: ma5 > ma10 && ma10 > ma20
    };
  }

  function validateMarketData(marketData, indicators) {
    const missing = Array.isArray(marketData?.data_quality?.missing) ? [...marketData.data_quality.missing] : [];
    if (marketData?.data_quality?.valid === false) missing.push(marketData.data_quality.error || '上游数据标记为无效');
    if (marketData?.data_quality?.conflict) missing.push('双源行情冲突');
    const quote = marketData?.quote || {};
    const numericFields = ['price', 'open', 'high', 'low', 'volume'];
    numericFields.forEach((field) => {
      const value = finiteNumber(quote[field]);
      if (!Number.isFinite(value) || value < 0 || (field !== 'volume' && value <= 0)) missing.push(`缺少${field}`);
    });
    if (finiteNumber(quote.high) < finiteNumber(quote.low)) missing.push('最高价低于最低价');
    if (!indicators || indicators.series.length < 20) missing.push('历史K线不足20日');
    if (!indicators || ![indicators.ma5, indicators.ma10, indicators.ma20].every(Number.isFinite)) missing.push('关键均线不足');
    if (!indicators || !Number.isFinite(indicators.volumeRatio)) missing.push('成交量基准不足');
    return { valid: missing.length === 0, missing: [...new Set(missing)] };
  }

  function makeSignal(action, ruleId, title, reason, options = {}) {
    const definition = ACTIONS[action] || ACTIONS.warning;
    return {
      action,
      label: definition.label,
      tone: definition.tone,
      priority: options.priority ?? definition.priority,
      ruleId,
      title,
      reason,
      scope: options.scope || 'position',
      confirmed: options.confirmed !== false,
      details: options.details || {}
    };
  }

  function dailyMarketDecisionData(marketData) {
    const bars = (marketData?.daily_bars || []).map(normalizeBar).filter(validBar);
    if (bars.length < 2) return marketData;
    const current = bars.at(-1);
    const previous = bars.at(-2);
    return {
      ...marketData,
      source_time: `${current.date}T15:00:00+08:00`,
      quote: {
        ...(marketData.quote || {}),
        price: current.close,
        previous_close: previous.close,
        open: current.open,
        high: current.high,
        low: current.low,
        volume: current.volume,
        amount: current.amount
      },
      daily_bars: bars
    };
  }

  function evaluateMarketEnvironment(marketData) {
    const neutral = { status: 'neutral', effectiveStatus: 'neutral', risk: false, highVolume: false, reason: '大盘未触发高位放量' };
    if (!marketData) return { ...neutral, reason: '大盘数据不可用，仅跳过“大盘高位放量”检查' };
    const decisionData = dailyMarketDecisionData(marketData);
    const indicators = calculateIndicators(decisionData);
    const quality = validateMarketData(decisionData, indicators);
    if (!quality.valid || indicators.series.length < 25) {
      return { ...neutral, reason: `${quality.missing.join('、') || '大盘数据不足'}，仅跳过“大盘高位放量”检查` };
    }
    const high60 = indicators.prior.length >= 60 ? Math.max(...indicators.prior.slice(-60).map((bar) => bar.high)) : NaN;
    const highVolume = Number.isFinite(high60) && indicators.current.close >= high60 * 0.98 && indicators.volumeConfirmed;
    return {
      status: 'neutral',
      effectiveStatus: 'neutral',
      risk: highVolume,
      highVolume,
      basis: 'daily_bars',
      asOf: indicators.current?.date || '',
      reason: highVolume ? '大盘高位放量，触发禁止追高检查' : '大盘未触发高位放量'
    };
  }

  function detectPatterns(indicators) {
    const current = indicators.current;
    const previous = indicators.prior.at(-1);
    const currentShape = candleShape(current, indicators.securityType);
    const previousShape = previous ? candleShape(previous, indicators.securityType) : null;
    const pairedPriceSetup = detectPairedPriceTop(indicators.series, indicators.securityType);
    const stagnant = indicators.volumeConfirmed
      && Math.abs(indicators.change) < 0.01
      && Number.isFinite(indicators.previousHigh20)
      && Math.abs(current.close - indicators.previousHigh20) / indicators.previousHigh20 < 0.03;
    const lastThree = indicators.series.slice(-3);
    const threeBigBull = lastThree.length === 3 && lastThree.every((bar) => candleShape(bar, indicators.securityType).bigBull);
    return {
      currentShape,
      previousShape,
      bullishEngulfing: isBullishEngulfing(previous, current),
      morningStar: isMorningStar(indicators.series, indicators.securityType),
      pairedPriceTop: pairedPriceSetup.active,
      pairedPriceSetup,
      stagnant,
      threeBigBull,
      previousBigBull: Boolean(previousShape?.bigBull)
    };
  }

  function previousPullbackSetup(indicators) {
    const none = { confirmed: false, support: null };
    if (indicators.series.length < 22) return none;
    const previous = indicators.series.at(-2);
    const before = indicators.series.at(-3);
    const previousMa10 = movingAverage(indicators.series, 10, 1);
    const previousMa20 = movingAverage(indicators.series, 20, 1);
    const volumePeriod = 5;
    const previousBaseline = average(indicators.series.slice(-(volumePeriod + 2), -2).map((bar) => bar.volume));
    const previousRatio = previousBaseline > 0 ? previous.volume / previousBaseline : NaN;
    const support = [
      { label: 'MA10', value: previousMa10 },
      { label: 'MA20', value: previousMa20 }
    ].map((item) => ({ ...item, distance: item.value > 0 ? Math.abs(previous.low - item.value) / item.value : Infinity }))
      .filter((item) => item.distance < 0.015)
      .sort((left, right) => left.distance - right.distance)[0];
    const shape = candleShape(previous, indicators.securityType);
    const confirmed = previousRatio <= 0.8 && Boolean(support) && (shape.hammer || isBullishEngulfing(before, previous));
    return confirmed ? { confirmed: true, support } : none;
  }

  function detectDAdd(indicators) {
    const bars = indicators.series;
    const none = { active: false, bollEnhanced: false };
    if (bars.length < 25 || !indicators.current || indicators.current.close <= indicators.current.open) return none;
    const priorThree = bars.slice(-4, -1);
    if (priorThree.length < 2) return none;
    const lows = priorThree.map((bar) => bar.low);
    const didNotMakeNewLow = lows.slice(1).every((low, index) => low >= lows[index] * 0.998);
    const hadBreak = priorThree.some((bar, index) => {
      const offset = priorThree.length - index;
      const ma5 = movingAverage(bars, 5, offset);
      return Number.isFinite(ma5) && bar.close < ma5;
    });
    const shrink = Number.isFinite(indicators.volumeRatio) && indicators.volumeRatio <= 0.8;
    const recoveredMa5 = indicators.current.close >= indicators.ma5;
    const recoveredBollMiddle = indicators.current.close >= indicators.bollMiddle;
    const active = hadBreak && didNotMakeNewLow && shrink && recoveredMa5;
    return {
      active,
      hadBreak,
      didNotMakeNewLow,
      shrink,
      recoveredMa5,
      recoveredBollMiddle,
      bollEnhanced: active && recoveredBollMiddle && indicators.bollMiddleRising
    };
  }

  function resolveSignals(signals) {
    const sorted = [...signals].sort((left, right) => right.priority - left.priority);
    const primary = sorted[0] || makeSignal('hold', 'default_hold', '纪律判断', '未触发加仓、减仓或离场条件');
    const secondary = sorted.filter((signal) => signal !== primary).slice(0, 2);
    return { primary, secondary, all: sorted };
  }

  function evaluateInstrument(marketData, context = {}) {
    const indicators = calculateIndicators(marketData);
    const quality = validateMarketData(marketData, indicators);
    if (!quality.valid) {
      const primary = makeSignal('unavailable', 'data_quality', '数据不可用', quality.missing.join('、'), { confirmed: false, scope: 'data' });
      return {
        dataStatus: 'unavailable',
        quality,
        indicators,
        patterns: null,
        market: context.market || null,
        blocked: true,
        primary,
        secondary: [],
        signals: [primary]
      };
    }

    const patterns = detectPatterns(indicators);
    const signals = [];
    const addCandidates = [];
    const current = indicators.current;
    const previous = indicators.prior.at(-1);
    const volumeRatio = indicators.volumeRatio;
    const expandedVolume = Number.isFinite(volumeRatio) && volumeRatio >= 1.3;
    const breakoutVolume = expandedVolume && volumeRatio <= 1.8;
    const shrink = Number.isFinite(volumeRatio) && volumeRatio <= 0.8;
    const hugeVolume = Number.isFinite(volumeRatio) && volumeRatio >= 2.5;
    const rising = indicators.change > 0;
    const falling = indicators.change < 0;
    const belowMa5 = current.close < indicators.ma5;
    const belowMa10 = current.close < indicators.ma10;
    const belowMa20 = current.close < indicators.ma20;
    const shapeExitEligible = !patterns.currentShape.doji;
    const market = context.market || null;
    const keySupport = finiteNumber(
      context.keySupport
      ?? context.breakoutSupport
      ?? marketData.key_support
      ?? marketData.breakout_support
      ?? marketData.quote?.key_support
      ?? marketData.quote?.breakout_support
    );
    const structureBroken = Number.isFinite(keySupport) && keySupport > 0 && current.close < keySupport;
    const structureBreakPersistent = structureBroken
      && indicators.series.slice(-2).every((bar) => bar.close < keySupport);
    const sustainedBelowMa20 = sustainedBelowMovingAverage(indicators.series, 20, 3);
    const lowerLowsAfterBreak = consecutiveLowerLowsAfterMa5Break(indicators.series, 3);
    const ma5CrossUnderMa10 = indicators.previousMa5 >= indicators.previousMa10
      && indicators.ma5 < indicators.ma10;
    const ma5CrossUnderMa20 = indicators.previousMa5 >= indicators.previousMa20
      && indicators.ma5 < indicators.ma20;
    const aboveBollUpper = Number.isFinite(indicators.bollUpper) && current.close > indicators.bollUpper;
    const belowBollMiddle = Number.isFinite(indicators.bollMiddle) && current.close < indicators.bollMiddle;
    const belowBollLower = Number.isFinite(indicators.bollLower) && current.close < indicators.bollLower;
    const bollUpperTrend = Number.isFinite(indicators.bollUpper)
      && current.close >= indicators.bollUpper * 0.985
      && indicators.bollUpperRising
      && indicators.bollBandwidthExpanding;
    const bollMiddleIntact = Number.isFinite(indicators.bollMiddle)
      && current.close >= indicators.bollMiddle
      && indicators.bollMiddleRising;
    const bollMiddleBreakEnhanced = belowBollMiddle && indicators.bollBandwidthExpanding;
    const bollLowerBreakEnhanced = belowBollLower
      && indicators.bollLowerFalling
      && indicators.bollBandwidthExpanding;

    if (shapeExitEligible && patterns.currentShape.extremeUpper && hugeVolume) {
      signals.push(makeSignal(
        'clear',
        'extreme_upper_shadow',
        '极端放量长上影·立即清仓',
        `出现极端长上影线并达到放巨量标准（量比${volumeRatio.toFixed(2)}），按纪律立即清仓`,
        {
          priority: EXIT_PRIORITIES.extremeUpper,
          details: { bollEnhanced: aboveBollUpper }
        }
      ));
    }

    if ((ma5CrossUnderMa10 || ma5CrossUnderMa20) && sustainedBelowMa20) {
      signals.push(makeSignal(
        'clear',
        'ma5_cross_sustained_below_ma20',
        '趋势反转·清仓剩余仓位',
        `MA5下穿MA10或MA20，且股价连续运行于MA20 ${indicators.ma20.toFixed(indicators.priceDigits)}下方${bollMiddleBreakEnhanced ? '；BOLL中轨同步转弱，反转确认增强' : ''}`,
        {
          priority: 970,
          details: { bollEnhanced: bollMiddleBreakEnhanced }
        }
      ));
    }

    if (lowerLowsAfterBreak) {
      signals.push(makeSignal(
        'clear',
        'lower_lows_after_break',
        '破位后持续创新低·全部离场',
        '跌破MA5后连续2-3根K线低点越来越低，按纪律全部离场',
        { priority: 950 }
      ));
    }

    const pairedTop = patterns.pairedPriceTop;
    if (pairedTop) {
      signals.push(makeSignal(
        'exit_60_70',
        'paired_top_volume',
        '对子顶伴随放量·出60%-70%',
        `对子顶信号伴随放量，量比${volumeRatio.toFixed(2)}，按纪律出60%-70%`,
        { priority: EXIT_PRIORITIES.pairedTop }
      ));
    }

    if (shapeExitEligible && expandedVolume && patterns.previousBigBull && patterns.currentShape.longUpper) {
      signals.push(makeSignal(
        'reduce_50_60',
        'long_upper_after_big_bull_volume',
        '长上影线伴随放量·减仓50%-60%',
        `大阳线后出现长上影线并伴随放量，量比${volumeRatio.toFixed(2)}${aboveBollUpper ? '；同时冲出BOLL上轨，资金兑现风险增强' : ''}`,
        {
          priority: EXIT_PRIORITIES.warningPatternVolume + (aboveBollUpper ? 5 : 0),
          details: { bollEnhanced: aboveBollUpper }
        }
      ));
    }

    if (shapeExitEligible
      && expandedVolume
      && patterns.currentShape.longUpper
      && !patterns.previousBigBull
      && !patterns.currentShape.extremeUpper) {
      signals.push(makeSignal(
        'warning',
        'volume_long_upper_warning',
        '放量长上影·警惕资金兑现',
        `出现放量长上影线，量比${volumeRatio.toFixed(2)}${aboveBollUpper ? '，且冲出BOLL上轨，风险确认增强' : ''}`,
        {
          priority: VOLUME_PRICE_PRIORITIES.stagnation + (aboveBollUpper ? 5 : 0),
          details: { bollEnhanced: aboveBollUpper }
        }
      ));
    }

    if (falling && expandedVolume && structureBroken) {
      signals.push(makeSignal(
        structureBreakPersistent ? 'clear' : 'reduce_30_50',
        structureBreakPersistent ? 'persistent_volume_break_key_support' : 'volume_break_key_support',
        structureBreakPersistent ? '关键平台有效跌破·清仓' : '结构破坏·继续减仓',
        structureBreakPersistent
          ? `放量跌破关键支撑${keySupport.toFixed(indicators.priceDigits)}后连续无法快速收回，按纪律清仓${bollLowerBreakEnhanced ? '；BOLL下轨同步破位，结构破坏确认增强' : ''}`
          : `放量跌破前期突破平台或关键支撑${keySupport.toFixed(indicators.priceDigits)}，按纪律继续减仓${bollLowerBreakEnhanced ? '；BOLL下轨同步破位，结构破坏确认增强' : ''}`,
        {
          priority: structureBreakPersistent ? 960 : EXIT_PRIORITIES.structureBreak + (bollLowerBreakEnhanced ? 5 : 0),
          details: { keySupport, bollEnhanced: bollLowerBreakEnhanced }
        }
      ));
    }

    if (falling && expandedVolume && belowMa20) {
      signals.push(makeSignal(
        'reduce_30_50',
        'volume_break_ma20',
        '趋势破坏·减仓30%-50%',
        `放量跌破MA20 ${indicators.ma20.toFixed(indicators.priceDigits)}，量比${volumeRatio.toFixed(2)}${bollMiddleBreakEnhanced ? '；BOLL中轨同步跌破且带宽扩张，减仓优先级提高' : ''}`,
        {
          priority: EXIT_PRIORITIES.ma20Break + (bollMiddleBreakEnhanced ? 5 : 0),
          details: { bollEnhanced: bollMiddleBreakEnhanced }
        }
      ));
    }
    else if (falling && expandedVolume && belowMa5) {
      signals.push(makeSignal(
        'reduce_30',
        'volume_break_ma5',
        '放量破MA5且未收回·减仓30%',
        `当前价未收回MA5 ${indicators.ma5.toFixed(indicators.priceDigits)}，量比${volumeRatio.toFixed(2)}，按止损纪律减仓30%${bollMiddleIntact ? '；BOLL中轨仍向上且未破坏，仅降低短期警报等级，不改变本次纪律动作' : ''}`,
        {
          priority: EXIT_PRIORITIES.ma5Break - (bollMiddleIntact ? 5 : 0),
          details: { bollReduced: bollMiddleIntact }
        }
      ));
    }
    else if (falling && expandedVolume && belowMa10) {
      signals.push(makeSignal(
        'warning',
        'volume_break_ma10_observe',
        '趋势转弱·放量跌破MA10观察',
        `放量跌破MA10 ${indicators.ma10.toFixed(indicators.priceDigits)}，按纪律进入趋势警戒${bollMiddleBreakEnhanced ? '；BOLL中轨同步跌破，转弱确认增强' : ''}`,
        {
          priority: EXIT_PRIORITIES.trendWarning + (bollMiddleBreakEnhanced ? 5 : 0),
          details: { bollEnhanced: bollMiddleBreakEnhanced }
        }
      ));
    }
    else if (shrink && belowMa20) {
      signals.push(makeSignal(
        'hold_no_sell',
        'shrink_break_ma20_observe',
        '缩量跌破MA20·先观察',
        `量比${volumeRatio.toFixed(2)}，缩量跌破MA20，按纪律先观察`,
        { priority: EXIT_PRIORITIES.shrinkObserve }
      ));
    }
    else if (shrink && belowMa10) {
      signals.push(makeSignal(
        'hold_no_sell',
        'shrink_break_ma10_observe',
        '缩量跌破MA10·暂不动作',
        `量比${volumeRatio.toFixed(2)}，缩量跌破MA10，按纪律暂不动作`,
        { priority: EXIT_PRIORITIES.shrinkObserve }
      ));
    }
    else if (shrink && belowMa5) {
      signals.push(makeSignal(
        'hold_no_sell',
        'shrink_break_ma5_observe',
        '缩量破MA5·观察不卖',
        `量比${volumeRatio.toFixed(2)}，缩量破MA5仅作观察，不卖`,
        { priority: EXIT_PRIORITIES.shrinkObserve }
      ));
    }

    if (expandedVolume && patterns.stagnant) {
      signals.push(makeSignal(
        'warning',
        'volume_stagnation',
        '放量滞涨·警惕高位换手',
        `量比${volumeRatio.toFixed(2)}达到放量标准，但价格滞涨${aboveBollUpper ? '；同时位于BOLL上轨外，风险增强' : ''}`,
        {
          priority: VOLUME_PRICE_PRIORITIES.stagnation + (aboveBollUpper ? 5 : 0),
          details: { bollEnhanced: aboveBollUpper }
        }
      ));
    }
    const supportLevels = [
      { label: 'MA10', value: indicators.ma10 },
      { label: 'MA20', value: indicators.ma20 }
    ];
    const touchedSupport = supportLevels
      .map((support) => ({
        ...support,
        distance: Math.abs(current.low - support.value) / support.value,
        reclaimed: current.low <= support.value * 1.015
          && current.low >= support.value * 0.95
          && current.close >= support.value
      }))
      .filter((support) => support.reclaimed)
      .sort((left, right) => left.distance - right.distance)[0];
    const pullbackShape = patterns.currentShape.hammer || patterns.bullishEngulfing;
    const currentPullbackConfirmed = Boolean(touchedSupport)
      && shrink
      && pullbackShape
      && current.close > current.open
      && current.close > previous.close;
    const previousPullback = previousPullbackSetup(indicators);
    const previousPullbackConfirmed = previousPullback.confirmed
      && current.close > current.open
      && current.close > previous.close;
    const pullbackConfirmed = currentPullbackConfirmed || previousPullbackConfirmed;
    const pullbackSupport = touchedSupport || previousPullback.support;
    const pullbackBollMiddle = currentPullbackConfirmed ? indicators.bollMiddle : indicators.previousBollMiddle;
    const bollMiddleResonance = Boolean(pullbackSupport)
      && Number.isFinite(pullbackBollMiddle)
      && Math.abs(pullbackSupport.value - pullbackBollMiddle) / pullbackBollMiddle <= 0.025;
    const trendBreakout = Number.isFinite(indicators.previousHigh20)
      && current.close > indicators.previousHigh20
      && breakoutVolume
      && indicators.bullishAlignment;
    const breakoutBollEnhanced = trendBreakout
      && aboveBollUpper
      && indicators.bollUpperRising
      && indicators.bollBandwidthExpanding;
    const volumeVsPrevious = previous?.volume > 0 ? current.volume / previous.volume : NaN;
    const reversal = patterns.morningStar
      && Number.isFinite(indicators.previousHigh20)
      && current.close > indicators.previousHigh20
      && volumeVsPrevious > 1;
    const reversalBollEnhanced = reversal
      && Number.isFinite(indicators.previousBollLower)
      && previous.low <= indicators.previousBollLower * 1.02
      && current.close >= indicators.bollMiddle;
    const recentLosses = indicators.series.slice(-4).map((bar, index, sample) => {
      if (index === 0) return NaN;
      return (sample[index - 1].close - bar.close) / sample[index - 1].close;
    }).slice(1);
    const declineFading = recentLosses.length === 3
      && recentLosses.every((value) => value > 0)
      && recentLosses[0] > recentLosses[1]
      && recentLosses[1] > recentLosses[2];
    const oversold = (indicators.rsi14 < 30 || indicators.deviationMa20 < -0.10)
      && declineFading
      && context.sectorStable === true;
    const oversoldBollEnhanced = oversold
      && ((current.low < indicators.bollLower && current.close >= indicators.bollLower)
        || (previous.low < indicators.previousBollLower && current.close >= indicators.bollLower));
    const dAdd = detectDAdd(indicators);

    if (pullbackConfirmed) {
      addCandidates.push(makeSignal(
        'add',
        'entry_pullback_confirmed',
        bollMiddleResonance ? '②回踩确认·BOLL共振优先加仓' : '②回踩确认·第2档加仓（20%-30%）',
        `缩量回踩${pullbackSupport.label}并出现锤子线或吞没形态，随后重新转强，按优先级最高的回踩纪律加仓20%-30%${bollMiddleResonance ? '；该支撑与BOLL中轨共振，信号等级提高' : ''}`,
        {
          scope: 'entry',
          priority: ENTRY_PRIORITIES.pullbackConfirmed + (bollMiddleResonance ? 10 : 0),
          details: { mode: 'pullback', allocation: '20%-30%', bollEnhanced: bollMiddleResonance }
        }
      ));
    }
    if (trendBreakout) {
      addCandidates.push(makeSignal(
        'add',
        'entry_breakout',
        '①趋势突破·第1档建仓（30%-40%）',
        `突破20日新高，量比${volumeRatio.toFixed(2)}处于1.3～1.8倍，且MA5>MA10>MA20${breakoutBollEnhanced ? '；同时突破BOLL上轨、上轨向上且带宽扩大，突破有效性增强' : ''}`,
        {
          scope: 'entry',
          priority: ENTRY_PRIORITIES.trendBreakout + (breakoutBollEnhanced ? 10 : 0),
          details: { mode: 'breakout', allocation: '30%-40%', bollEnhanced: breakoutBollEnhanced }
        }
      ));
    }
    if (reversal) {
      addCandidates.push(makeSignal(
        'add',
        'entry_reversal',
        '③反转形态·第3档加仓（10%-20%）',
        `早晨星后反弹突破前高，并伴随成交量改善，按纪律加仓10%-20%${reversalBollEnhanced ? '；同时从BOLL下轨附近止跌并站回中轨，反转确认增强' : ''}`,
        {
          scope: 'entry',
          priority: ENTRY_PRIORITIES.reversal + (reversalBollEnhanced ? 10 : 0),
          details: { mode: 'reversal', allocation: '10%-20%', bollEnhanced: reversalBollEnhanced }
        }
      ));
    }
    if (oversold) {
      addCandidates.push(makeSignal(
        'add',
        'entry_oversold',
        '④超跌反弹·仅≤20%小仓',
        `股价超跌、下跌衰减且板块企稳，仅按纪律使用不超过20%的小仓位${oversoldBollEnhanced ? '；跌破BOLL下轨后快速收回，超跌反弹确认增强' : ''}`,
        {
          scope: 'entry',
          priority: ENTRY_PRIORITIES.oversold + (oversoldBollEnhanced ? 10 : 0),
          details: { mode: 'oversold', allocation: '≤20%', bollEnhanced: oversoldBollEnhanced }
        }
      ));
    }
    if (dAdd.active) {
      addCandidates.push(makeSignal(
        'd_add',
        'entry_d_add',
        '破位后不创新低·D档加仓',
        `破位后2-3根K线不创新低、缩量企稳并重新站回趋势线，当前反弹收阳，按纪律执行D档补仓${dAdd.bollEnhanced ? '；同时站回BOLL中轨且中轨向上，补仓确认增强' : ''}`,
        {
          scope: 'entry',
          priority: ENTRY_PRIORITIES.dAdd + (dAdd.bollEnhanced ? 10 : 0),
          details: { mode: 'd_add', bollEnhanced: dAdd.bollEnhanced }
        }
      ));
    }
    if (rising && expandedVolume) {
      signals.push(makeSignal(
        'hold',
        'volume_price_up_volume',
        bollUpperTrend ? '强趋势·沿BOLL上轨持有' : '上涨放量·趋势确认',
        `上涨伴随放量，量比${volumeRatio.toFixed(2)}，趋势得到确认；只有同时满足四种入场模式之一才执行加仓${bollUpperTrend ? '；股价沿BOLL上轨运行、上轨向上且带宽扩大，强趋势持有' : ''}`,
        {
          scope: 'entry',
          priority: 190,
          details: { bollEnhanced: bollUpperTrend }
        }
      ));
    }

    if (rising && shrink) {
      signals.push(makeSignal('hold', 'volume_price_up_shrink', '上涨缩量·持有不追高', `量比${volumeRatio.toFixed(2)}，上涨缩量可持有但不追高`, { priority: VOLUME_PRICE_PRIORITIES.risingShrink }));
    }
    if (falling && shrink) {
      signals.push(makeSignal('hold_no_sell', 'volume_price_down_shrink', '下跌缩量·正常回踩', `量比${volumeRatio.toFixed(2)}，下跌缩量按纪律观察支撑`, { priority: VOLUME_PRICE_PRIORITIES.fallingShrink }));
    }

    const sectorWeak = indicators.securityType === 'STOCK'
      && indicators.change > 0
      && finiteNumber(context.sectorChange) < 0;
    const chaseReasons = [
      patterns.threeBigBull && '连续3根大阳线',
      indicators.deviationMa20 > 0.10 && '股价距离MA20超过10%',
      hugeVolume && patterns.currentShape.longUpper && '放巨量长上影线',
      sectorWeak && '个股涨但板块弱',
      market?.highVolume && '大盘高位放量'
    ].filter(Boolean);
    const chaseBlocked = chaseReasons.length > 0;
    const riskBlocksAdding = signals.some((signal) => signal.priority >= ACTIONS.warning.priority);
    addCandidates.forEach((candidate) => {
      if (riskBlocksAdding) return;
      if (chaseBlocked && candidate.action !== 'd_add') return;
      signals.push(candidate);
    });
    if (chaseBlocked) {
      signals.push(makeSignal(
        'hold',
        'no_chase',
        '禁止追高·持有观望',
        `${chaseReasons.join('；')}，已有仓位可持有，但禁止追高`,
        { scope: 'entry', priority: 110 }
      ));
    }

    if (signals.length === 0) {
      signals.push(makeSignal('hold', 'default_hold', '纪律判断', '未触发加仓、减仓或离场条件，按纪律持有观察'));
    }
    const resolved = resolveSignals(signals);
    return {
      dataStatus: 'ok',
      quality,
      indicators,
      patterns,
      market,
      blocked: chaseBlocked,
      primary: resolved.primary,
      secondary: resolved.secondary,
      signals: resolved.all
    };
  }

  function shouldAnnounce(cache, symbol, signal, now = Date.now(), cooldownMs = 300000) {
    if (!signal || !['clear', 'reduce', 'warning', 'add'].includes(signal.tone)) return false;
    const key = `${symbol}|${signal.action}|${signal.ruleId}`;
    const previous = cache.get(key);
    if (!previous || now - previous.timestamp >= cooldownMs || signal.priority > previous.priority) {
      cache.set(key, { timestamp: now, priority: signal.priority });
      return true;
    }
    return false;
  }

  function publicIndicators(indicators) {
    return {
      securityType: indicators.securityType,
      priceDigits: indicators.priceDigits,
      ma5: round(indicators.ma5),
      ma10: round(indicators.ma10),
      ma20: round(indicators.ma20),
      ma60: round(indicators.ma60),
      bollMiddle: round(indicators.bollMiddle),
      bollUpper: round(indicators.bollUpper),
      bollLower: round(indicators.bollLower),
      bollBandwidth: round(indicators.bollBandwidth, 4),
      bollMiddleRising: indicators.bollMiddleRising,
      bollUpperRising: indicators.bollUpperRising,
      bollLowerFalling: indicators.bollLowerFalling,
      bollBandwidthExpanding: indicators.bollBandwidthExpanding,
      volumeRatio: round(indicators.volumeRatio, 2),
      volumeLevel: indicators.volumeLevel,
      volumePeriod: indicators.volumePeriod,
      volumeConfirmationRatio: round(indicators.volumeConfirmationRatio, 2),
      historicalMaxVolume: round(indicators.historicalMaxVolume, 2),
      historicalVolumeHigh: indicators.historicalVolumeHigh,
      volumeConfirmed: indicators.volumeConfirmed,
      rsi14: round(indicators.rsi14, 2),
      previousHigh20: round(indicators.previousHigh20),
      previousLow20: round(indicators.previousLow20),
      deviationMa20: round(indicators.deviationMa20, 4),
      bullishAlignment: indicators.bullishAlignment
    };
  }

  return {
    ACTIONS,
    EXIT_PRIORITIES,
    ENTRY_PRIORITIES,
    VOLUME_PRICE_PRIORITIES,
    DISCIPLINE_SECTIONS,
    finiteNumber,
    symbolDigits,
    securityTypeOf,
    priceDigits,
    tradingProgress,
    isTradingSession,
    normalizeBar,
    validBar,
    buildSeries,
    movingAverage,
    bollingerBands,
    averageVolume,
    relativeStrengthIndex,
    candleShape,
    isBullishEngulfing,
    isMorningStar,
    isPairedPriceTop,
    detectPairedPriceTop,
    volumeLevel,
    calculateIndicators,
    validateMarketData,
    evaluateMarketEnvironment,
    evaluateInstrument,
    resolveSignals,
    shouldAnnounce,
    publicIndicators
  };
});

