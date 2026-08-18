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
    wait_add: { label: '等待加仓确认', tone: 'warning', priority: 440 },
    warning: { label: '警示观察', tone: 'warning', priority: 500 },
    reduce_30: { label: '减仓30%', tone: 'reduce', priority: 710 },
    reduce_30_40: { label: '减仓30%-40%', tone: 'reduce', priority: 735 },
    reduce_30_50: { label: '减仓30%-50%', tone: 'reduce', priority: 760 },
    reduce_50_60: { label: '减仓50%-60%', tone: 'reduce', priority: 820 },
    exit_60_70: { label: '出60%-70%', tone: 'reduce', priority: 880 },
    clear: { label: '立即清仓', tone: 'clear', priority: 1000 }
  };

  const ENTRY_PRIORITIES = {
    pullbackConfirmed: 470,
    trendBreakout: 450,
    pullbackWaiting: 445,
    localBreakout: 440,
    reversal: 430,
    oversold: 410,
    dAdd: 390
  };

  const VOLUME_PRICE_PRIORITIES = {
    preBreakoutStrength: 230,
    risingVolume: 105,
    stagnation: 520,
    fallingShrink: 170,
    risingShrink: 160
  };

  const DISCIPLINE_SECTIONS = [
    {
      title: '🛡 前置总闸：大盘环境过滤（基于日线周期）',
      groups: [
        {
          title: '大盘状态与可操作范围',
          items: [
            ['多头市场', '指数>MA20 且 MA5>MA10 → ①②③④全部可操作'],
            ['震荡市', '指数在MA20附近反复 → ①②③可操作，总仓位≤60%'],
            ['空头市场', '指数<MA20 → 仅④超跌反弹可操作，总仓位≤20%，①②③暂停']
          ]
        }
      ],
      notes: [['执行原则', '先过大盘总闸，再判断个股入场；大盘状态不明时暂停新增仓位']]
    },
    {
      title: '💡 入场四模式 · 金字塔加仓 · 五层递进退场（基于日线周期）',
      groups: [
        {
          title: '1. 入场模式',
          items: [
            ['① 趋势突破', '突破20日新高 + 放量（量比≥1.3，≥1.8为强放量，≥2.5为放巨量） + MA5>MA10>MA20'],
            ['② 回踩确认', '缩量回踩MA5/MA10/MA20 + 锤子线/吞没 + 重新转强（胜率最高）'],
            ['③ 反转形态', '早晨星 + 反弹突破前高 + 放量改善（当日量>前日量且量比≥1.3）'],
            ['④ 超跌反弹', '股价超跌 + 下跌衰减 + 板块企稳（仅≤20%小仓）']
          ]
        },
        {
          title: '2. 加仓金字塔（固定仓位制）',
          items: [
            ['第1档（40%）', '初始突破建立底仓｜止损：突破K线最低点'],
            ['第2档（按支撑位）', '缩量回踩支撑 + 止跌确认｜MA5不破加25%｜MA10不破加20%｜MA20不破加15%｜止损：支撑位下方1%-2%'],
            ['第3档（15%）', '放量突破前高 + 多头排列保持｜止损：MA10'],
            ['第D档', '破位后2-3根K线不创新低 → 反弹补仓｜用已减仓部分的30%-50%回补｜止损：反弹新低'],
            ['现金储备（20%）', '不动用，应对意外']
          ]
        },
        {
          title: '3. 离场五层递进',
          items: [
            ['① 动能减弱', '缩量跌破MA5 → 仅作观察（不卖）｜放量跌破MA5且当日未收回 → 减仓30%（止损）'],
            ['② 趋势转弱', '缩量跌破MA10 → 暂不动作｜放量跌破MA10 → 减仓30%-40%'],
            ['③ 趋势破坏', '放量跌破MA20 → 减仓30%-50%｜缩量跌破 → 先观察'],
            ['④ 结构破坏', '放量跌破前期突破平台/关键支撑 → 继续减仓'],
            ['⑤ 趋势反转', 'MA5下穿MA10（死叉）+ 放量 → 清仓剩余仓位']
          ]
        }
      ],
      notes: [
        ['核心原则', '趋势优先 → 量价确认 → 回踩优先 → 分批建仓 → 上涨加仓 → 破位减仓'],
        ['禁止追高', '连续3根大阳线、股价距离MA20超10%-12%、放巨量长上影线、个股涨但板块弱']
      ]
    },
    {
      title: '💼 离场纪律与决策优先级',
      groups: [
        {
          title: '1. 趋势优先，量价确认',
          items: [
            ['放量上涨', '不触发离场'],
            ['放量上涨 + 突破关键位', '触发加仓判断'],
            ['上涨缩量', '可持有（不追高）'],
            ['下跌缩量', '正常回踩（观察支撑）'],
            ['放量下跌 + 跌破MA10', '进入风险观察'],
            ['放量下跌 + 跌破MA20', '减仓30%-50%'],
            ['放量下跌 + 跌破关键平台/前期突破位', '继续减仓'],
            ['放量滞涨', '警惕高位换手（警示信号）'],
            ['放量长上影', '警惕资金兑现（减仓信号）']
          ]
        },
        {
          title: '2. 突破前蓄势 / 强势转强（持仓状态识别）',
          items: [
            ['触发条件', '股价>MA5 + MA5>MA10>MA20 + 此前3-5日主要在MA5附近缩量整理 + 整理期间未有效跌破MA10 + 当日收阳并明显转强 + 量比≥1.20 + 尚未突破20日新高'],
            ['系统动作', '持有观望｜强势转强'],
            ['识别说明', 'MA5附近缩量整理 → 放量转强；尚未突破20日新高，等待突破确认']
          ]
        },
        {
          title: '3. 趋势线破坏（MA5为核心）',
          items: [
            ['缩量破MA5', '观察（不卖）'],
            ['放量破MA5（量比≥1.3）+ 当日未收回', '减仓30%（止损）'],
            ['破位后2-3根K线不创新低', '反弹补仓（D档加仓）'],
            ['破位后2-3根K线越来越低', '全部离场']
          ]
        },
        {
          title: '4. K线与形态',
          items: [
            ['长上影线 + 大阳线后 + 放量', '减仓50%-60%'],
            ['K线双顶 + 创新高 + 放量', '出60%-70%；未创新高或回调途中不提示'],
            ['极端长上影线', '立即清仓'],
            ['价格对子顶 + 放量（仅历史新高）', '明显上涨后，尾数对子最高价严格创可用历史新高 + 放量长上影线 → 出60%-70%；未创新高和反弹途中均不提示'],
            ['连续大阳线/涨停后：跳空长上下影小阳线', '缩量减一部分｜放量出比一半多'],
            ['连续大阳线/涨停后：极长上影、实体几乎没有', '缩量减一部分｜放量出比一半多']
          ]
        },
        {
          title: '5. 盘口警示（连续大阳线/涨停线后）',
          items: [
            ['剧烈震荡盘口', '反复大波浪形态剧烈震荡 → 缩量减一部分｜放量出比一半多'],
            ['假强势盘口', '开盘急速拉升但不涨停/炸板 → 缩量减一部分｜放量出比一半多'],
            ['异常盘口', '最高点出现对子顶、拖拉机单等 → 缩量减一部分｜放量出比一半多']
          ]
        },
        {
          title: '6. 决策顺序（必须按照）',
          items: [
            ['①', '放量跌破趋势线 → 立即减仓/清仓'],
            ['②', '趋势线仍完整 → 判断K线形态'],
            ['③', 'K线出现警示 → 观察是否伴随放量'],
            ['④', '放量警示信号 → 缓慢减仓'],
            ['⑤', '无警示信号 → 如无其他理由可持有/加仓']
          ]
        }
      ],
      notes: [
        ['并列判断', '量、趋势线、K线、盘口四条同时判断，以量和趋势线为主，不可等走完整个顺序才动手'],
        ['单日上限', '多信号叠加时，单日累计减仓≤剩余仓位的70%；明确清仓规则除外'],
        ['趋势线画法', '单边上升从突破箱体起涨点画线，取接触实体最多的直线；箱体结构破底部即离场。MA5为程序近似'],
        ['禁止追高', '连续3+大阳线｜股价距离MA20超10%｜放巨量长上影｜个股涨板块弱｜大盘高位放量'],
        ['程序近似', '用MA5作主趋势线、5日均量作成交量基准（放量=量比≥1.3，≥1.8为强放量，≥2.5为放巨量），离场优先判趋势线+量能；盘口项仅在数据源提供盘中结构时触发']
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
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function buildSeries(marketData) {
    const quote = marketData.quote || {};
    const bars = (marketData.daily_bars || []).map(normalizeBar).filter(validBar);
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
    if (last && last.date && sourceDate && last.date === sourceDate) {
      bars[bars.length - 1] = {
        ...current,
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
    if (!Array.isArray(bars) || bars.length < 21) return none;

    const lastIndex = bars.length - 1;
    const riseThreshold = securityType === 'ETF' ? 0.08 : 0.15;
    const candidate = bars[lastIndex];
    if (!isPairedPriceTop(candidate.high, securityType)) return none;

    const prior = bars.slice(0, lastIndex);
    const stage = prior.slice(-120);
    const historicalHigh = Math.max(...prior.map((bar) => bar.high));
    const stageLow = Math.min(...stage.map((bar) => bar.low));
    const riseFromStageLow = stageLow > 0 ? candidate.high / stageLow - 1 : 0;
    const isHistoricalHigh = historicalHigh > 0 && candidate.high > historicalHigh;

    // 只认明显上涨后严格创可用历史新高；未创新高或反弹途中不提示。
    if (!isHistoricalHigh || riseFromStageLow < riseThreshold) return none;

    const shape = candleShape(candidate, securityType);
    if (!shape.longUpper || shape.doji) return none;

    const baselineVolume = average(prior.slice(-5).map((bar) => bar.volume));
    const volumeRatio = baselineVolume > 0 ? candidate.volume / baselineVolume : NaN;
    const historicalMaxVolume = Math.max(...prior.map((bar) => bar.volume));
    const historicalVolumeHigh = candidate.volume > 0
      && historicalMaxVolume > 0
      && candidate.volume > historicalMaxVolume;
    const volumeConfirmed = volumeRatio >= 1.3;
    if (!volumeConfirmed) return none;

    return {
      active: true,
      confirmed: true,
      price: candidate.high,
      age: 0,
      volumeRatio,
      volumeConfirmed,
      historicalVolumeHigh,
      longUpper: true,
      doji: false,
      riseFromStageLow,
      historicalHigh
    };
  }

  function isKlineDoubleTop(bars, securityType = 'STOCK') {
    if (!Array.isArray(bars) || bars.length < 8) return false;
    const currentIndex = bars.length - 1;
    const current = bars[currentIndex];
    const previous = bars[currentIndex - 1];
    const priorHistoricalHigh = Math.max(...bars.slice(0, currentIndex).map((bar) => bar.high));
    if (!(current.high > priorHistoricalHigh)) return false;
    const currentShape = candleShape(current, securityType);
    const secondPeakRejected = current.close < current.open
      || current.close < previous.close
      || currentShape.longUpper;
    if (!secondPeakRejected) return false;

    const firstCandidate = Math.max(1, currentIndex - 20);
    const lastCandidate = currentIndex - 3;
    for (let peakIndex = firstCandidate; peakIndex <= lastCandidate; peakIndex += 1) {
      const peak = bars[peakIndex];
      const left = bars[peakIndex - 1];
      const right = bars[peakIndex + 1];
      const localPeak = peak.high >= left.high
        && peak.high >= right.high
        && (peak.high > left.high || peak.high > right.high);
      if (!localPeak) continue;

      const peakDifference = Math.abs(peak.high - current.high) / Math.max(peak.high, current.high);
      if (peakDifference > 0.01) continue;

      const trough = Math.min(...bars.slice(peakIndex + 1, currentIndex).map((bar) => bar.low));
      const lowerPeak = Math.min(peak.high, current.high);
      if ((lowerPeak - trough) / lowerPeak >= 0.03) return true;
    }
    return false;
  }

  function volumeLevel(ratio) {
    if (!Number.isFinite(ratio) || ratio <= 0) return '未知';
    if (ratio < 0.8) return '缩量';
    if (ratio < 1) return '平量';
    if (ratio < 1.3) return '温和放量';
    if (ratio < 1.8) return '放量';
    if (ratio < 2.5) return '强放量';
    return '巨量';
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
    const projectedVolume = current && progress > 0 ? current.volume / progress : NaN;
    const volumeRatio = baselineVolume > 0 ? projectedVolume / baselineVolume : NaN;
    const volumeConfirmationRatio = baselineVolume > 0 && current ? current.volume / baselineVolume : NaN;
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
      bullishAlignment: ma5 > ma10 && ma10 > ma20 && (securityType !== 'ETF' || !Number.isFinite(ma60) || ma20 > ma60),
      deathCross: previousMa5 >= previousMa10 && ma5 < ma10
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
    if (!marketData) return { status: 'unknown', effectiveStatus: 'unknown', risk: false, positionCap: 0, allowedModes: [], reason: '大盘数据不可用，暂停新增仓位' };
    const decisionData = dailyMarketDecisionData(marketData);
    const indicators = calculateIndicators(decisionData);
    const quality = validateMarketData(decisionData, indicators);
    if (!quality.valid || indicators.series.length < 25) return { status: 'unknown', effectiveStatus: 'unknown', risk: false, positionCap: 0, allowedModes: [], reason: `${quality.missing.join('、') || '大盘数据不足'}，暂停新增仓位` };
    const ma20FiveDaysAgo = movingAverage(indicators.series, 20, 5);
    const slope = ma20FiveDaysAgo > 0 ? (indicators.ma20 / ma20FiveDaysAgo - 1) / 5 : 0;
    const ma20NeutralBand = 0.005;
    const ma20Distance = indicators.current.close / indicators.ma20 - 1;
    let status = 'sideways';
    if (ma20Distance > ma20NeutralBand && indicators.ma5 > indicators.ma10) status = 'bull';
    else if (ma20Distance < -ma20NeutralBand) status = 'bear';
    const shapes = indicators.series.slice(-3).map((bar) => candleShape(bar, 'STOCK'));
    const lastThree = indicators.series.slice(-3);
    const volumeIncreasingDeclines = lastThree.length === 3
      && lastThree.every((bar) => bar.close < bar.open)
      && lastThree[0].volume < lastThree[1].volume
      && lastThree[1].volume < lastThree[2].volume;
    const risk = (indicators.volumeRatio >= 2.5 && shapes.at(-1)?.longUpper)
      || volumeIncreasingDeclines
      || indicators.change <= -0.02;
    const effectiveStatus = status;
    const high60 = indicators.prior.length >= 60 ? Math.max(...indicators.prior.slice(-60).map((bar) => bar.high)) : NaN;
    const highVolume = Number.isFinite(high60) && indicators.current.close >= high60 * 0.98 && indicators.volumeConfirmed;
    const positionCap = status === 'bull' ? 100 : status === 'sideways' ? 60 : 20;
    const allowedModes = status === 'bull'
      ? ['breakout', 'pullback', 'reversal', 'oversold']
      : status === 'sideways'
        ? ['breakout', 'pullback', 'reversal']
        : ['oversold'];
    const statusReason = status === 'bull'
      ? '大盘多头：①②③④均可操作'
      : status === 'bear'
        ? '大盘空头：仅④超跌反弹可操作，总仓位≤20%'
        : '大盘震荡：①②③可操作，总仓位≤60%';
    return {
      status,
      effectiveStatus,
      risk,
      highVolume,
      slope,
      ma20: indicators.ma20,
      ma20Distance,
      ma20NeutralBand,
      basis: 'daily_bars',
      asOf: indicators.current?.date || '',
      positionCap,
      allowedModes,
      reason: risk ? `${statusReason}；同时触发大盘风险，禁止追高` : statusReason
    };
  }

  function detectPatterns(indicators, marketData) {
    const current = indicators.current;
    const previous = indicators.prior.at(-1);
    const currentShape = candleShape(current, indicators.securityType);
    const previousShape = previous ? candleShape(previous, indicators.securityType) : null;
    const klineDoubleTop = isKlineDoubleTop(indicators.series, indicators.securityType);
    const pairedPriceSetup = detectPairedPriceTop(indicators.series, indicators.securityType);
    const stagnant = indicators.volumeConfirmed
      && Math.abs(indicators.change) < 0.01
      && Number.isFinite(indicators.previousHigh20)
      && Math.abs(current.close - indicators.previousHigh20) / indicators.previousHigh20 < 0.03;
    const lastThree = indicators.series.slice(-3);
    const threeBigBull = lastThree.length === 3 && lastThree.every((bar) => candleShape(bar, indicators.securityType).bigBull);
    const priorThree = indicators.prior.slice(-3);
    const priorTwo = indicators.prior.slice(-2);
    const priorStrongRun = priorTwo.length === 2
      && priorTwo.every((bar) => candleShape(bar, indicators.securityType).bigBull);
    const safeBody = Math.max(currentShape.body, current.close * 0.000001);
    const gapSmallBullWithShadows = Boolean(previous
      && priorStrongRun
      && current.open > previous.high
      && currentShape.bullish
      && !currentShape.doji
      && currentShape.body / current.close < 0.015
      && currentShape.upper > safeBody * 1.5
      && currentShape.lower > safeBody * 1.5);
    const tinyBodyLongUpperAfterRun = priorStrongRun
      && currentShape.bullish
      && !currentShape.doji
      && currentShape.longUpper
      && currentShape.body / current.close < 0.012;
    const tapeSource = marketData.intraday_signals || marketData.quote?.intraday_signals || marketData.quote?.tape_signals || {};
    const tapeWarnings = {
      violentOscillation: tapeSource.violent_oscillation === true || tapeSource.violentOscillation === true,
      fakeStrength: tapeSource.fake_strength === true || tapeSource.fakeStrength === true || tapeSource.failed_limit_up === true,
      abnormalOrders: tapeSource.abnormal_orders === true || tapeSource.abnormalOrders === true || tapeSource.tractor_orders === true
    };
    return {
      currentShape,
      previousShape,
      bullishEngulfing: isBullishEngulfing(previous, current),
      morningStar: isMorningStar(indicators.series, indicators.securityType),
      klineDoubleTop,
      pairedPriceTop: pairedPriceSetup.active,
      pairedPriceSetup,
      stagnant,
      threeBigBull,
      previousBigBull: Boolean(previousShape?.bigBull),
      priorStrongRun,
      gapSmallBullWithShadows,
      tinyBodyLongUpperAfterRun,
      tapeWarnings,
      premiumRate: finiteNumber(marketData.quote?.premium_rate)
    };
  }

  function previousPullbackSetup(indicators) {
    const none = { confirmed: false, support: null };
    if (indicators.series.length < 22) return none;
    const previous = indicators.series.at(-2);
    const before = indicators.series.at(-3);
    const previousMa5 = movingAverage(indicators.series, 5, 1);
    const previousMa10 = movingAverage(indicators.series, 10, 1);
    const previousMa20 = movingAverage(indicators.series, 20, 1);
    const volumePeriod = 5;
    const previousBaseline = average(indicators.series.slice(-(volumePeriod + 2), -2).map((bar) => bar.volume));
    const previousRatio = previousBaseline > 0 ? previous.volume / previousBaseline : NaN;
    const support = [
      { label: 'MA5', value: previousMa5 },
      { label: 'MA10', value: previousMa10 },
      { label: 'MA20', value: previousMa20 }
    ].map((item) => ({ ...item, distance: item.value > 0 ? Math.abs(previous.low - item.value) / item.value : Infinity }))
      .filter((item) => item.distance < 0.015)
      .sort((left, right) => left.distance - right.distance)[0];
    const shape = candleShape(previous, indicators.securityType);
    const confirmed = previousRatio < 0.8 && Boolean(support) && (shape.hammer || isBullishEngulfing(before, previous));
    return confirmed ? { confirmed: true, support } : none;
  }

  function isMa5CloseHeld(indicators, current, shrink, confirmed) {
    const ma5 = indicators?.ma5;
    if (!confirmed || !shrink || !indicators?.bullishAlignment || !Number.isFinite(ma5) || ma5 <= 0 || !current) return false;
    return current.close >= ma5
      && current.close <= ma5 * 1.03
      && current.low <= ma5 * 1.015
      && current.low >= ma5 * 0.96;
  }

  function detectPreBreakoutStrength(indicators) {
    const bars = indicators?.series;
    const current = indicators?.current;
    if (!Array.isArray(bars) || bars.length < 25 || !current || indicators.prior.length < 10) return false;
    if (!(current.close > indicators.ma5
      && indicators.bullishAlignment
      && current.close > current.open
      && current.close > indicators.prior.at(-1).close
      && indicators.volumeRatio >= 1.2
      && current.high <= indicators.previousHigh20)) return false;

    const consolidation = indicators.prior.slice(-5);
    const earlier = indicators.prior.slice(-10, -5);
    let nearMa5Days = 0;
    let heldMa10 = true;
    consolidation.forEach((bar, index) => {
      const offset = consolidation.length - index;
      const dayMa5 = movingAverage(bars, 5, offset);
      const dayMa10 = movingAverage(bars, 10, offset);
      const nearMa5 = Number.isFinite(dayMa5)
        && Math.abs(bar.close - dayMa5) / dayMa5 <= 0.03
        && bar.low <= dayMa5 * 1.02
        && bar.high >= dayMa5 * 0.98;
      if (nearMa5) nearMa5Days += 1;
      if (!Number.isFinite(dayMa10) || bar.close < dayMa10 * 0.99) heldMa10 = false;
    });
    const consolidationVolumes = consolidation.map((bar) => bar.volume);
    const earlierVolumes = earlier.map((bar) => bar.volume);
    const consolidationAverageVolume = average(consolidationVolumes);
    const earlierAverageVolume = average(earlierVolumes);
    const consolidationHigh = Math.max(...consolidation.map((bar) => bar.high));
    const consolidationLow = Math.min(...consolidation.map((bar) => bar.low));
    const compactRange = consolidationLow > 0 && consolidationHigh / consolidationLow - 1 <= 0.08;
    const volumeContracted = !Number.isFinite(earlierAverageVolume)
      || earlierAverageVolume <= 0
      || consolidationAverageVolume <= earlierAverageVolume * 1.05;
    const bodyStrength = current.open > 0 && (current.close - current.open) / current.open >= 0.005;
    return nearMa5Days >= 3 && heldMa10 && compactRange && volumeContracted && bodyStrength;
  }

  function detectDAdd(indicators) {
    const bars = indicators.series;
    if (bars.length < 25 || !indicators.current || indicators.current.close <= indicators.current.open) return false;
    const priorThree = bars.slice(-4, -1);
    if (priorThree.length < 2) return false;
    const lows = priorThree.map((bar) => bar.low);
    const didNotMakeNewLow = lows.slice(1).every((low, index) => low >= lows[index] * 0.998);
    const hadBreak = priorThree.some((bar, index) => {
      const offset = priorThree.length - index;
      const ma5 = movingAverage(bars, 5, offset);
      return Number.isFinite(ma5) && bar.close < ma5;
    });
    return hadBreak && didNotMakeNewLow;
  }

  function detectContinuedDeclineAfterBreak(indicators) {
    const bars = indicators.series;
    if (bars.length < 25) return false;
    const recent = bars.slice(-4);
    for (let breakIndex = 1; breakIndex <= 2; breakIndex += 1) {
      const before = recent[breakIndex - 1];
      const afterBreak = recent.slice(breakIndex);
      if (afterBreak.length < 2) continue;
      const beforeOffset = recent.length - breakIndex;
      const breakOffset = recent.length - 1 - breakIndex;
      const beforeMa5 = movingAverage(bars, 5, beforeOffset);
      const breakMa5 = movingAverage(bars, 5, breakOffset);
      const crossedBelow = Number.isFinite(beforeMa5)
        && Number.isFinite(breakMa5)
        && before.close >= beforeMa5
        && afterBreak[0].close < breakMa5;
      const lowerLows = afterBreak.slice(1).every((bar, index) => bar.low < afterBreak[index].low * 0.998);
      if (crossedBelow && lowerLows) return true;
    }
    return false;
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
      return { dataStatus: 'unavailable', quality, indicators, patterns: null, market: context.market || null, blocked: true, primary, secondary: [], signals: [primary] };
    }

    const patterns = detectPatterns(indicators, marketData);
    const signals = [];
    const current = indicators.current;
    const volumeRatio = indicators.volumeRatio;
    const entryVolumeRatio = volumeRatio;
    const shrink = volumeRatio < 0.8;
    const volume = indicators.volumeConfirmed;
    const expandedVolume = Number.isFinite(entryVolumeRatio) && entryVolumeRatio >= 1.3;
    const hugeVolume = entryVolumeRatio >= 2.5;
    const rising = indicators.change > 0.001;
    const falling = indicators.change < -0.001;
    const isConfirmed = !isTradingSession(marketData.source_time);
    const shapeExitEligible = !patterns.currentShape.doji;
    const market = context.market || { status: 'unknown', effectiveStatus: 'unknown', risk: false, positionCap: 0, allowedModes: [], reason: '大盘数据不可用，暂停新增仓位' };
    const continuedDeclineAfterBreak = detectContinuedDeclineAfterBreak(indicators);

    if (continuedDeclineAfterBreak) signals.push(makeSignal('clear', 'post_break_lower_lows', '破位后持续创新低·全部离场', '跌破MA5后连续2-3根K线低点越来越低，按纪律全部离场', { confirmed: isConfirmed }));
    if (shapeExitEligible && patterns.currentShape.extremeUpper) signals.push(makeSignal('clear', 'extreme_upper_shadow', '极端长上影线', '上影线超过实体3倍且超过收盘价3%，按纪律立即清仓', { confirmed: isConfirmed }));
    if (indicators.deathCross && volume) signals.push(makeSignal('clear', 'ma5_death_cross', '第五层·趋势反转', 'MA5从上方下穿MA10并获量价确认，按纪律清仓离场', { confirmed: isConfirmed }));
    else if (indicators.deathCross) signals.push(makeSignal('warning', 'ma5_death_cross_wait_volume', '趋势反转待量能确认', 'MA5已下穿MA10，但尚未达到放量确认标准，先警示观察', { confirmed: false }));
    if (shapeExitEligible && patterns.klineDoubleTop) {
      if (volume) {
        const volumeReason = indicators.historicalVolumeHigh
          ? '当日成交量创可用历史新高'
          : `量比达到${indicators.volumeRatio.toFixed(2)}`;
        signals.push(makeSignal('exit_60_70', 'kline_double_top_confirmed', '创新高K线双顶放量·出60%-70%', `第二峰严格创可用历史新高、两峰价格接近、中间回撤≥3%且第二峰转弱；${volumeReason}，按纪律出60%-70%`, { confirmed: isConfirmed }));
      } else {
        signals.push(makeSignal('hold', 'kline_double_top_wait_volume', '创新高K线双顶候选·持有观察', '第二峰已严格创可用历史新高并形成M头候选，但当日量能未确认，持有观察，不减仓', { confirmed: false, priority: 115 }));
      }
    }
    const pairedPrice = patterns.pairedPriceSetup;
    if (pairedPrice.active && pairedPrice.confirmed) {
      const volumeReason = pairedPrice.historicalVolumeHigh
        ? '对子日成交量创可用历史新高'
        : `对子日成交量达到前5日均量的${pairedPrice.volumeRatio.toFixed(2)}倍`;
      signals.push(makeSignal('exit_60_70', 'paired_price_top_confirmed', '历史新高价格对子顶·出60%-70%', `明显上涨后最高价${pairedPrice.price.toFixed(indicators.priceDigits)}形成价格对子并严格创可用历史新高，伴随放量长上影；${volumeReason}，按纪律出60%-70%`, { confirmed: true }));
    }
    const postStrongRunPattern = patterns.gapSmallBullWithShadows || patterns.tinyBodyLongUpperAfterRun;
    if (shapeExitEligible && postStrongRunPattern) {
      if (volume) signals.push(makeSignal('exit_60_70', 'post_strong_run_kline_volume', '连续大阳线后异常K线·出60%-70%', '连续大阳线/涨停线后出现跳空长上下影小阳线或极长上影小实体阳线，并伴随放量，按纪律出比一半多', { confirmed: isConfirmed }));
      else if (shrink) signals.push(makeSignal('reduce_30', 'post_strong_run_kline_shrink', '连续大阳线后异常K线·减一部分', '连续大阳线/涨停线后出现警示K线但成交量萎缩，按纪律先减一部分', { confirmed: isConfirmed }));
      else signals.push(makeSignal('warning', 'post_strong_run_kline_wait_volume', '连续大阳线后异常K线·观察量能', '连续大阳线/涨停线后出现警示K线，量能尚未明确，先警示观察', { confirmed: false }));
    } else if (shapeExitEligible && patterns.currentShape.longUpper && patterns.previousBigBull && volume) {
      signals.push(makeSignal('reduce_50_60', 'upper_after_big_bull', '大阳线后放量长上影', '前一日大阳线后出现放量长上影，按纪律减仓50%-60%', { confirmed: isConfirmed }));
    } else if (shapeExitEligible && patterns.currentShape.longUpper && volume) {
      signals.push(makeSignal('reduce_30', 'volume_long_upper', '放量长上影·减仓信号', '放量长上影显示资金兑现，按纪律缓慢减仓', { confirmed: isConfirmed }));
    }

    const tapeWarningNames = [
      patterns.tapeWarnings.violentOscillation && '剧烈震荡盘口',
      patterns.tapeWarnings.fakeStrength && '开盘急拉未涨停/炸板',
      patterns.tapeWarnings.abnormalOrders && '拖拉机单等异常盘口'
    ].filter(Boolean);
    if (tapeWarningNames.length) {
      const tapeReason = `${tapeWarningNames.join('、')}，仅依据数据源已提供的盘中结构判断`;
      if (volume) signals.push(makeSignal('exit_60_70', 'tape_warning_volume', '盘口警示放量·出60%-70%', `${tapeReason}；伴随放量，按纪律出比一半多`, { confirmed: true }));
      else if (shrink) signals.push(makeSignal('reduce_30', 'tape_warning_shrink', '盘口警示缩量·减一部分', `${tapeReason}；成交量萎缩，按纪律减一部分`, { confirmed: true }));
      else signals.push(makeSignal('warning', 'tape_warning_wait_volume', '盘口警示·观察量能', `${tapeReason}；量能尚未明确，先警示观察`, { confirmed: false }));
    }
    if (current.close < indicators.previousLow20) {
      if (falling && volume) signals.push(makeSignal('reduce_30_50', 'key_support_break', '第四层·结构破坏', `放量下跌并跌破前期突破平台/关键支撑${indicators.previousLow20.toFixed(indicators.priceDigits)}，按纪律继续减仓`));
      else if (volume) signals.push(makeSignal('warning', 'key_support_break_wait_direction', '关键平台下方·等待方向确认', '已在关键平台/前期突破位下方，但当日不是放量下跌，先进入风险观察'));
    }

    if (current.close < indicators.ma20) {
      if (falling && volume) signals.push(makeSignal('reduce_30_50', 'ma20_break_volume', '第三层·趋势破坏', `量比${volumeRatio.toFixed(2)}，放量下跌并跌破MA20 ${indicators.ma20.toFixed(indicators.priceDigits)}，按纪律减仓30%-50%`));
      else if (shrink) signals.push(makeSignal('hold_no_sell', 'ma20_break_shrink', '缩量跌破MA20', '缩量破位，先观察，不直接减仓'));
      else signals.push(makeSignal('warning', 'ma20_break_unconfirmed_volume', '跌破MA20待量能确认', '量能未达到放量标准，暂按警示观察'));
    }

    if (current.close < indicators.ma5) {
      if (volume && isConfirmed) signals.push(makeSignal('reduce_30', 'ma5_break_volume', '放量跌破MA5', `量比${volumeRatio.toFixed(2)}且收盘未收回MA5，按纪律减仓30%`));
      else if (volume) signals.push(makeSignal('warning', 'ma5_break_intraday', '盘中放量跌破MA5', '盘中动态信号，等待收盘确认', { confirmed: false }));
      else if (shrink) signals.push(makeSignal('hold_no_sell', 'ma5_break_shrink', '第一层·动能减弱', '缩量跌破MA5，仅观察，不卖'));
      else signals.push(makeSignal('warning', 'ma5_break_mild', '跌破MA5待确认', '量能不足以确认破位，继续观察'));
    }

    if (current.close < indicators.ma10 && current.close >= indicators.ma20) {
      signals.push(falling && volume
        ? makeSignal('warning', 'ma10_break_volume', '放量下跌并跌破MA10·风险观察', '进入风险观察，等待是否收回MA10；尚未跌破MA20，不执行减仓')
        : makeSignal('hold_no_sell', 'ma10_break_no_volume', '跌破MA10暂不动作', '未放量，按纪律暂不卖出'));
    }

    if (rising && expandedVolume) signals.push(makeSignal('hold', 'volume_price_up', '放量上涨·不触发离场', '放量上涨只确认趋势，不触发离场；只有突破20日新高或关键位后才进入加仓判断', { priority: VOLUME_PRICE_PRIORITIES.risingVolume }));
    if (rising && shrink) signals.push(makeSignal('hold', 'volume_price_up_shrink', '趋势完整·上涨缩量', '趋势线完整，上涨缩量可持有但不追高', { priority: VOLUME_PRICE_PRIORITIES.risingShrink }));
    if (falling && shrink) signals.push(makeSignal('hold_no_sell', 'volume_price_down_shrink', '回踩观察·下跌缩量', '下跌缩量属于正常回踩，继续判断MA5/MA10/MA20支撑是否收回', { priority: VOLUME_PRICE_PRIORITIES.fallingShrink }));
    if (patterns.stagnant) signals.push(makeSignal('warning', 'volume_stagnation', '量价警示·放量滞涨', '量比≥1.3、涨幅不足1%且接近前高，警惕高位换手', { priority: VOLUME_PRICE_PRIORITIES.stagnation }));

    const stockDeviationLimit = indicators.securityType === 'ETF' ? 0.12 : 0.10;
    const sectorWeak = indicators.securityType === 'STOCK' && indicators.change > 0.02 && finiteNumber(context.sectorChange) < 0;
    const chaseReasons = [
      patterns.threeBigBull && '连续3根大阳线',
      indicators.deviationMa20 > stockDeviationLimit && `距离MA20超过${stockDeviationLimit * 100}%`,
      hugeVolume && patterns.currentShape.longUpper && '放巨量长上影线',
      sectorWeak && '个股涨但板块弱',
      market.highVolume && '大盘高位放量'
    ].filter(Boolean);
    const chaseBlocked = chaseReasons.length > 0;

    const supportLevels = [
      { label: 'MA5', value: indicators.ma5 },
      { label: 'MA10', value: indicators.ma10 },
      { label: 'MA20', value: indicators.ma20 }
    ];
    const touchedSupport = supportLevels
      .map((support) => ({ ...support, distance: support.value > 0 ? Math.abs(current.low - support.value) / support.value : Infinity }))
      .filter((support) => support.distance < 0.015)
      .sort((left, right) => left.distance - right.distance)[0];
    const nearMa5 = touchedSupport?.label === 'MA5';
    const nearMa10 = touchedSupport?.label === 'MA10';
    const nearMa20 = touchedSupport?.label === 'MA20';
    const candleRange = current.high - current.low;
    const supportTurnStrength = Boolean(touchedSupport)
      && current.close > current.open
      && current.close >= touchedSupport.value
      && (current.close - current.open) / touchedSupport.value >= 0.01
      && candleRange > 0
      && (current.close - current.low) / candleRange >= 0.55;
    const ma5CloseHeldCandidate = isMa5CloseHeld(indicators, current, shrink, true);
    const ma5CloseHeld = ma5CloseHeldCandidate && isConfirmed;
    const pullbackShape = patterns.currentShape.hammer || patterns.bullishEngulfing || supportTurnStrength;
    const pullbackWarning = (shrink && (nearMa5 || nearMa10 || nearMa20) && pullbackShape)
      || (ma5CloseHeldCandidate && !isConfirmed);
    const supportRecovered = Boolean(touchedSupport)
      && shrink
      && indicators.bullishAlignment
      && pullbackShape
      && supportTurnStrength;
    const pullbackPrevious = indicators.prior.at(-1);
    const previousPullback = previousPullbackSetup(indicators);
    const previousPullbackConfirmed = previousPullback.confirmed
      && current.close > current.open
      && current.close > pullbackPrevious.close;
    const pullbackConfirmed = previousPullbackConfirmed || supportRecovered || ma5CloseHeld;
    const trendBreakout = current.close > indicators.previousHigh20 && expandedVolume && indicators.bullishAlignment;
    const previousHigh5 = indicators.prior.length >= 5
      ? Math.max(...indicators.prior.slice(-5).map((bar) => bar.high))
      : NaN;
    const previousBar = indicators.prior.at(-1);
    const volumeVsPrevious = previousBar?.volume > 0 ? current.volume / previousBar.volume : NaN;
    const localBreakout = !trendBreakout
      && Number.isFinite(previousHigh5)
      && current.close > previousHigh5
      && current.high > previousHigh5
      && current.close > current.open
      && indicators.bullishAlignment
      && expandedVolume;
    const reversal = patterns.morningStar
      && current.close > indicators.previousHigh20
      && entryVolumeRatio >= 1.3
      && volumeVsPrevious > 1
      && indicators.bullishAlignment;
    const recentChanges = indicators.series.slice(-4).map((bar, index, sample) => index === 0 ? 0 : (sample[index - 1].close - bar.close) / sample[index - 1].close).slice(1);
    const declineFading = recentChanges.length === 3 && recentChanges[0] > recentChanges[1] && recentChanges[1] > recentChanges[2] && recentChanges[2] > 0;
    const oversoldBase = (indicators.rsi14 < 30 || indicators.deviationMa20 < -0.10) && declineFading;
    const sectorStable = context.sectorStable === true;
    const dAdd = detectDAdd(indicators);
    const preBreakoutStrength = detectPreBreakoutStrength(indicators);
    const addCandidates = [];
    if (preBreakoutStrength) signals.push(makeSignal('hold', 'pre_breakout_strength', '持有观望｜强势转强', 'MA5附近缩量整理 → 放量转强；尚未突破20日新高，等待突破确认', { priority: VOLUME_PRICE_PRIORITIES.preBreakoutStrength, details: { mode: 'pre_breakout_strength', breakoutLevel: indicators.previousHigh20 } }));
    if (trendBreakout) addCandidates.push(makeSignal('add', 'entry_breakout', '①趋势突破·第1档建仓（40%）', `突破20日新高并达到5日均量${entryVolumeRatio.toFixed(2)}倍，MA5>MA10>MA20；止损设在突破K线最低点${current.low.toFixed(indicators.priceDigits)}`, { scope: 'entry', priority: ENTRY_PRIORITIES.trendBreakout, details: { mode: 'breakout', entryMode: 'breakout', allocation: '40%', stop: current.low, rank: 2 } }));
    if (pullbackConfirmed) {
      const confirmedSupport = ma5CloseHeld ? supportLevels[0] : touchedSupport || previousPullback.support || supportLevels[1];
      const pullbackAllocation = confirmedSupport.label === 'MA5' ? '25%' : confirmedSupport.label === 'MA10' ? '20%' : '15%';
      const pullbackReason = ma5CloseHeld
        ? '缩量回踩MA5，盘中触及或短暂下探后收盘重新站上MA5，按MA5不破确认'
        : supportRecovered
          ? `缩量回踩${touchedSupport.label}后收阳并回收支撑，止跌重新转强`
          : '前一日缩量回踩MA5/MA10/MA20并出现锤子线或吞没形态，今日重新转强';
      addCandidates.push(makeSignal('add', 'entry_pullback_confirmed', `②回踩确认·第2档加仓（${pullbackAllocation}）`, `${pullbackReason}；回踩${confirmedSupport.label}不破，加仓${pullbackAllocation}，止损设在支撑位${confirmedSupport.value.toFixed(indicators.priceDigits)}下方1%-2%`, { scope: 'entry', priority: ENTRY_PRIORITIES.pullbackConfirmed, details: { mode: 'pullback', entryMode: 'pullback', allocation: pullbackAllocation, rank: 1, support: confirmedSupport.label } }));
    }
    else if (pullbackWarning) {
      const waitingSupport = ma5CloseHeldCandidate ? supportLevels[0] : touchedSupport;
      const waitAllocation = waitingSupport.label === 'MA5' ? '25%' : waitingSupport.label === 'MA10' ? '20%' : '15%';
      const waitReason = ma5CloseHeldCandidate
        ? '盘中缩量回踩MA5并重新站上，等待收盘确认MA5不破'
        : `缩量触及${waitingSupport.label}并出现锤子线或吞没形态，等待重新转强`;
      addCandidates.push(makeSignal('wait_add', 'entry_pullback_wait', '②回踩确认候选·等待重新转强', `${waitReason}后再加仓${waitAllocation}`, { scope: 'entry', priority: ENTRY_PRIORITIES.pullbackWaiting, confirmed: false, details: { mode: 'pullback', entryMode: 'pullback', allocation: waitAllocation, rank: 1, support: waitingSupport.label } }));
    }
    if (localBreakout) addCandidates.push(makeSignal('add', 'entry_local_breakout', '突破关键位·第3档加仓（15%）', `放量上涨并突破近5日关键高点${previousHigh5.toFixed(indicators.priceDigits)}，触发加仓判断；多头排列保持，止损设在MA10 ${indicators.ma10.toFixed(indicators.priceDigits)}`, { scope: 'entry', priority: ENTRY_PRIORITIES.localBreakout, details: { mode: 'local_breakout', entryMode: 'reversal', allocation: '15%', stop: indicators.ma10, rank: 3 } }));
    if (reversal) addCandidates.push(makeSignal('add', 'entry_reversal', '③反转形态·第3档加仓（15%）', `早晨星后突破20日前高，当日量为5日均量${entryVolumeRatio.toFixed(2)}倍且高于前日，止损设在MA10 ${indicators.ma10.toFixed(indicators.priceDigits)}`, { scope: 'entry', priority: ENTRY_PRIORITIES.reversal, details: { mode: 'reversal', entryMode: 'reversal', allocation: '15%', stop: indicators.ma10, rank: 3 } }));
    if (oversoldBase) addCandidates.push(makeSignal(sectorStable ? 'add' : 'wait_add', 'entry_oversold', '④超跌反弹（≤20%小仓）', sectorStable ? '股价超跌、下跌衰减且板块企稳，仅建议≤20%小仓' : '超跌和下跌衰减成立，但板块企稳尚未确认，暂不加仓', { scope: 'entry', priority: ENTRY_PRIORITIES.oversold, confirmed: sectorStable, details: { mode: 'oversold', entryMode: 'oversold', allocation: '≤20%', rank: 4 } }));
    if (dAdd) addCandidates.push(makeSignal('d_add', 'entry_d_add', '反弹补仓·D档加仓', '破位后2-3根K线不创新低且当前反弹收阳，用已减仓部分的30%-50%回补；止损设在反弹新低', { scope: 'entry', priority: ENTRY_PRIORITIES.dAdd, details: { mode: 'd_add', entryMode: 'pullback', allocation: '已减仓部分的30%-50%', stop: '反弹新低' } }));

    const riskBlocksAdding = signals.some((signal) => signal.priority >= ACTIONS.warning.priority);
    const marketStatus = market.effectiveStatus || market.status || 'unknown';
    const marketPositionCap = Number.isFinite(market.positionCap)
      ? market.positionCap
      : marketStatus === 'bull' ? 100 : marketStatus === 'sideways' ? 60 : marketStatus === 'bear' ? 20 : 0;
    const blockedByMarket = [];
    let addedByMarket = false;
    let chaseOverrideUsed = false;
    addCandidates.forEach((candidate) => {
      const entryMode = candidate.details.entryMode || 'breakout';
      const marketAllowed = marketStatus === 'bull'
        || (marketStatus === 'sideways' && entryMode !== 'oversold')
        || (marketStatus === 'bear' && entryMode === 'oversold');
      if (!marketAllowed) {
        blockedByMarket.push(candidate);
        return;
      }
      const chaseExempt = candidate.ruleId === 'entry_pullback_confirmed' || candidate.ruleId === 'entry_d_add';
      if ((chaseBlocked && !chaseExempt) || riskBlocksAdding) return;
      if (chaseBlocked && chaseExempt) {
        candidate.reason += '；该信号属于支撑位确认回踩/回补，不按追高信号硬拦截';
        candidate.details.chaseOverride = true;
        chaseOverrideUsed = true;
      }
      candidate.details.marketStatus = marketStatus;
      candidate.details.positionCap = marketPositionCap;
      if (marketStatus === 'sideways') candidate.reason += '；大盘震荡，总仓位不得超过60%';
      if (marketStatus === 'bear') candidate.reason += '；大盘空头，仅限超跌反弹且总仓位不得超过20%';
      signals.push(candidate);
      addedByMarket = true;
    });
    if (chaseBlocked && !chaseOverrideUsed) signals.push(makeSignal('hold', 'no_chase', '持有观望·禁止追高', `${chaseReasons.join('；')}，已有仓位可持有，但禁止新增仓位`, { scope: 'entry', priority: 110 }));
    if (blockedByMarket.length && !addedByMarket && !riskBlocksAdding && !chaseBlocked) {
      const title = marketStatus === 'bear'
        ? '大盘总闸·空头市场暂停①②③'
        : marketStatus === 'sideways'
          ? '大盘总闸·震荡市暂停④超跌反弹'
          : '大盘总闸·环境不明暂停新增仓位';
      const reason = marketStatus === 'bear'
        ? '指数位于MA20下方，仅④超跌反弹可操作且总仓位≤20%'
        : marketStatus === 'sideways'
          ? '震荡市仅①②③可操作且总仓位≤60%'
          : '大盘日线数据不足，等待总闸状态确认后再新增仓位';
      signals.push(makeSignal('warning', 'market_gate_block', title, reason, { scope: 'market', priority: 540, confirmed: marketStatus !== 'unknown', details: { marketStatus, positionCap: marketPositionCap } }));
    }

    if (signals.length === 0) signals.push(makeSignal('hold', 'default_hold', '纪律判断', '未触发加仓、减仓或离场条件，按纪律持有观察'));
    const resolved = resolveSignals(signals);
    return {
      dataStatus: 'ok',
      quality,
      indicators,
      patterns,
      market,
      blocked: chaseBlocked && !chaseOverrideUsed,
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
      bullishAlignment: indicators.bullishAlignment,
      deathCross: indicators.deathCross
    };
  }

  return {
    ACTIONS,
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
    averageVolume,
    relativeStrengthIndex,
    candleShape,
    isBullishEngulfing,
    isMorningStar,
    isMa5CloseHeld,
    detectPreBreakoutStrength,
    isPairedPriceTop,
    detectPairedPriceTop,
    isKlineDoubleTop,
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
