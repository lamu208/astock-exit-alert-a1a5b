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
    reduce_30_50: { label: '减仓30%-50%', tone: 'reduce', priority: 760 },
    reduce_50_60: { label: '减仓50%-60%', tone: 'reduce', priority: 820 },
    exit_60_70: { label: '出60%-70%', tone: 'reduce', priority: 880 },
    clear: { label: '立即清仓', tone: 'clear', priority: 1000 }
  };

  const DISCIPLINE_SECTIONS = [
    {
      title: '💡 入场四模式 · 金字塔加仓 · 五层递进离场',
      groups: [
        {
          title: '1. 入场模式',
          items: [
            ['① 趋势突破', '突破20日新高 + 放量1.3～1.8倍 + MA5>MA10>MA20'],
            ['② 回踩确认', '缩量回踩MA10/MA20 + 锤子线/吞没 + 次日重新转强（优先级最高）'],
            ['③ 反转形态', '早晨星 + 反弹突破前高 + 成交量改善'],
            ['④ 超跌反弹', '股价超跌 + 下跌衰减 + 板块企稳（仅≤20%小仓）']
          ]
        },
        {
          title: '2. 加仓金字塔',
          items: [
            ['第1档（30%-40%）', '初始突破建立底仓'],
            ['第2档（20%-30%）', '缩量回踩支撑 + 止跌确认'],
            ['第3档（10%-20%）', '放量突破前高 + 多头排列保持']
          ]
        },
        {
          title: '3. 离场五层递进',
          items: [
            ['① 动能减弱', '缩量跌破MA5 → 仅观察，不卖'],
            ['② 趋势转弱', '缩量跌破MA10 → 暂不动作；放量跌破MA10 → 警示观察'],
            ['③ 趋势破坏', '放量跌破MA20 → 减仓30%-50%；缩量跌破 → 先观察'],
            ['④ 结构破坏', '放量跌破前期突破平台/关键支撑 → 继续减仓'],
            ['⑤ 趋势反转', 'MA5下穿MA10并持续走弱，量价确认后按纪律离场']
          ]
        }
      ],
      notes: [
        ['核心原则', '趋势优先 → 量价确认 → 回踩优先 → 分批建仓 → 上涨加仓 → 破位减仓'],
        ['禁止追高', '连续3根大阳线、股价距离MA20超10%-12%、放巨量长上影线、个股涨但板块弱']
      ]
    },
    {
      title: '🚪 离场纪律与决策优先级',
      groups: [
        {
          title: '1. 量价关系判断（优先级最高）',
          items: [
            ['上涨放量', '趋势确认，可加仓'],
            ['上涨缩量', '可持有，不追高'],
            ['下跌缩量', '正常回踩，观察支撑'],
            ['放量滞涨', '警惕高位换手，警示观察'],
            ['放量长上影', '警惕资金兑现，减仓信号'],
            ['放量跌破MA20', '趋势风险，减仓30%-50%']
          ]
        },
        {
          title: '2. 趋势线破坏（MA5为核心）',
          items: [
            ['缩量破MA5', '观察，不卖'],
            ['放量破MA5且收盘未收回', '减仓30%'],
            ['破位后2-3根K线不创新低', '反弹补仓（D档加仓）']
          ]
        },
        {
          title: '3. K线与形态',
          items: [
            ['长上影 + 前一日大阳线 + 放量', '减仓50%-60%'],
            ['价格对子顶（仅历史新高）', '明显上涨后，尾数对子最高价严格创可用历史新高 + 放量长上影 + 3日未收回 → 出60%-70%；未创新高和反弹途中均不提示'],
            ['K线M头双顶', '与价格对子分开识别，仅作结构警示，再按趋势线和量能确认'],
            ['极端长上影线', '立即清仓']
          ]
        },
        {
          title: '4. 决策顺序（必须按照）',
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
        ['禁止追高', '连续3+大阳线｜股价距离MA20超10%｜放巨量长上影｜个股涨板块弱｜大盘高位放量'],
        ['程序近似', '用MA5作主趋势线、5日均量作成交量基准，离场优先判趋势线+量能']
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
    if (last && last.date && sourceDate && last.date === sourceDate) bars[bars.length - 1] = current;
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
    const firstCandidate = Math.max(20, lastIndex - 10);
    const riseThreshold = securityType === 'ETF' ? 0.08 : 0.15;
    const rejectionThreshold = securityType === 'ETF' ? 0.006 : 0.012;

    for (let candidateIndex = lastIndex; candidateIndex >= firstCandidate; candidateIndex -= 1) {
      const candidate = bars[candidateIndex];
      if (!isPairedPriceTop(candidate.high, securityType)) continue;

      const prior = bars.slice(0, candidateIndex);
      if (prior.length < 20) continue;
      const stage = prior.slice(-120);
      const historicalHigh = Math.max(...prior.map((bar) => bar.high));
      const stageLow = Math.min(...stage.map((bar) => bar.low));
      const riseFromStageLow = stageLow > 0 ? candidate.high / stageLow - 1 : 0;
      const isHistoricalHigh = historicalHigh > 0 && candidate.high > historicalHigh;

      // 价格对子只认明显上涨后严格创可用历史新高；未创新高或回调反弹途中一律不提示。
      if (!isHistoricalHigh || riseFromStageLow < riseThreshold) continue;

      const shape = candleShape(candidate, securityType);
      const rejectionRate = candidate.high > 0 ? (candidate.high - candidate.close) / candidate.high : 0;
      const rejectedAtHigh = shape.longUpper || rejectionRate >= rejectionThreshold;
      if (!rejectedAtHigh) continue;

      const baselineVolume = average(prior.slice(-5).map((bar) => bar.volume));
      const volumeRatio = baselineVolume > 0 ? candidate.volume / baselineVolume : NaN;
      const historicalMaxVolume = Math.max(...prior.map((bar) => bar.volume));
      const historicalVolumeHigh = candidate.volume > 0
        && historicalMaxVolume > 0
        && candidate.volume > historicalMaxVolume;
      const volumeConfirmed = volumeRatio >= 1.3 || historicalVolumeHigh;
      const later = bars.slice(candidateIndex + 1);
      const regained = later.some((bar) => bar.close >= candidate.high);

      // 3个交易日内重新站上对子价，信号直接失效，不再提示对子。
      if (regained) continue;

      const age = lastIndex - candidateIndex;
      return {
        active: true,
        confirmed: age >= 3 && volumeConfirmed && shape.longUpper && !shape.doji,
        price: candidate.high,
        age,
        volumeRatio,
        volumeConfirmed,
        historicalVolumeHigh,
        longUpper: shape.longUpper,
        doji: shape.doji,
        riseFromStageLow,
        historicalHigh
      };
    }

    return none;
  }

  function isKlineDoubleTop(bars, securityType = 'STOCK') {
    if (!Array.isArray(bars) || bars.length < 8) return false;
    const currentIndex = bars.length - 1;
    const current = bars[currentIndex];
    const previous = bars[currentIndex - 1];
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
    if (ratio < 2) return '放量';
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
    const volumeConfirmed = volumeConfirmationRatio >= 1.3 || historicalVolumeHigh;
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

  function evaluateMarketEnvironment(marketData) {
    if (!marketData) return { status: 'unknown', effectiveStatus: 'unknown', risk: false, reason: '大盘数据不可用' };
    const indicators = calculateIndicators(marketData);
    const quality = validateMarketData(marketData, indicators);
    if (!quality.valid || indicators.series.length < 25) return { status: 'unknown', effectiveStatus: 'unknown', risk: false, reason: quality.missing.join('、') || '大盘数据不足' };
    const ma20FiveDaysAgo = movingAverage(indicators.series, 20, 5);
    const slope = ma20FiveDaysAgo > 0 ? (indicators.ma20 / ma20FiveDaysAgo - 1) / 5 : 0;
    let status = 'sideways';
    if (indicators.current.close > indicators.ma20 && slope > 0.002) status = 'bull';
    if (indicators.current.close < indicators.ma20 && slope < -0.002) status = 'bear';
    const shapes = indicators.series.slice(-3).map((bar) => candleShape(bar, 'STOCK'));
    const lastThree = indicators.series.slice(-3);
    const volumeIncreasingDeclines = lastThree.length === 3
      && lastThree.every((bar) => bar.close < bar.open)
      && lastThree[0].volume < lastThree[1].volume
      && lastThree[1].volume < lastThree[2].volume;
    const risk = (indicators.volumeRatio >= 2 && shapes.at(-1)?.longUpper)
      || volumeIncreasingDeclines
      || indicators.change <= -0.02;
    const effectiveStatus = risk ? (status === 'bull' ? 'sideways' : 'bear') : status;
    const high60 = indicators.prior.length >= 60 ? Math.max(...indicators.prior.slice(-60).map((bar) => bar.high)) : NaN;
    const highVolume = Number.isFinite(high60) && indicators.current.close >= high60 * 0.98 && indicators.volumeRatio >= 1.5;
    return {
      status,
      effectiveStatus,
      risk,
      highVolume,
      slope,
      ma20: indicators.ma20,
      reason: risk ? '大盘风险触发，新增仓位信号降一级' : status === 'bull' ? '大盘多头' : status === 'bear' ? '大盘空头' : '大盘震荡'
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
      premiumRate: finiteNumber(marketData.quote?.premium_rate)
    };
  }

  function previousPullbackSetup(indicators) {
    if (indicators.series.length < 22) return false;
    const previous = indicators.series.at(-2);
    const before = indicators.series.at(-3);
    const previousMa10 = movingAverage(indicators.series, 10, 1);
    const previousMa20 = movingAverage(indicators.series, 20, 1);
    const volumePeriod = 5;
    const previousBaseline = average(indicators.series.slice(-(volumePeriod + 2), -2).map((bar) => bar.volume));
    const previousRatio = previousBaseline > 0 ? previous.volume / previousBaseline : NaN;
    const nearSupport = [previousMa10, previousMa20].some((ma) => ma > 0 && Math.abs(previous.low - ma) / ma < 0.015);
    const shape = candleShape(previous, indicators.securityType);
    return previousRatio < 0.8 && nearSupport && (shape.hammer || isBullishEngulfing(before, previous));
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
    const shrink = volumeRatio < 0.8;
    const volume = indicators.volumeConfirmed;
    const hugeVolume = volumeRatio >= 2;
    const rising = indicators.change > 0.001;
    const falling = indicators.change < -0.001;
    const isConfirmed = !isTradingSession(marketData.source_time);
    const shapeExitEligible = !patterns.currentShape.doji;
    const market = context.market || { status: 'unknown', effectiveStatus: 'unknown', risk: false, reason: '大盘数据不可用' };

    if (shapeExitEligible && patterns.currentShape.extremeUpper) signals.push(makeSignal('clear', 'extreme_upper_shadow', '极端长上影线', '上影线超过实体3倍且超过收盘价3%，按纪律立即清仓', { confirmed: isConfirmed }));
    if (indicators.deathCross && volume) signals.push(makeSignal('clear', 'ma5_death_cross', '第五层·趋势反转', 'MA5从上方下穿MA10并获量价确认，按纪律清仓离场', { confirmed: isConfirmed }));
    else if (indicators.deathCross) signals.push(makeSignal('warning', 'ma5_death_cross_wait_volume', '趋势反转待量能确认', 'MA5已下穿MA10，但尚未达到放量确认标准，先警示观察', { confirmed: false }));
    if (shapeExitEligible && patterns.klineDoubleTop) {
      if (volume) {
        const volumeReason = indicators.historicalVolumeHigh
          ? '当日成交量创可用历史新高'
          : `当日成交量达到前5日均量的${indicators.volumeConfirmationRatio.toFixed(2)}倍`;
        signals.push(makeSignal('warning', 'kline_double_top_warning', 'K线M头双顶放量警示', `两峰价格接近、中间回撤≥3%且第二峰转弱；${volumeReason}，该形态与价格对子分开判断，先警示并检查趋势线`, { confirmed: isConfirmed, priority: 520 }));
      } else {
        signals.push(makeSignal('hold', 'kline_double_top_wait_volume', 'K线M头双顶候选·持有观察', 'M头结构仅为候选，当日量能未确认且尚未形成有效破位，持有观察，不减仓', { confirmed: false, priority: 115 }));
      }
    }
    const pairedPrice = patterns.pairedPriceSetup;
    if (pairedPrice.active && pairedPrice.confirmed) {
      const volumeReason = pairedPrice.historicalVolumeHigh
        ? '对子日成交量创可用历史新高'
        : `对子日成交量达到前5日均量的${pairedPrice.volumeRatio.toFixed(2)}倍`;
      signals.push(makeSignal('exit_60_70', 'paired_price_top_confirmed', '历史新高价格对子顶·已确认', `明显上涨后最高价${pairedPrice.price.toFixed(indicators.priceDigits)}形成价格对子并严格创可用历史新高，伴随放量长上影，随后3个交易日未收回；${volumeReason}，按纪律出60%-70%`, { confirmed: true }));
    } else if (pairedPrice.active) {
      const daysRemaining = Math.max(0, 3 - pairedPrice.age);
      const missing = [
        !pairedPrice.volumeConfirmed && '量能未达前5日均量1.3倍且未创历史新高',
        !pairedPrice.longUpper && '尚无有效长上影',
        pairedPrice.doji && '属于无实体十字星，不执行离场'
      ].filter(Boolean);
      const waitingReason = pairedPrice.age < 3
        ? `仍需观察${daysRemaining}个交易日是否重新站上对子价`
        : `${missing.join('；') || '形态确认条件不足'}，不执行离场`;
      signals.push(makeSignal('warning', 'paired_price_top_wait_confirmation', '历史新高价格对子·等待确认', `明显上涨后最高价${pairedPrice.price.toFixed(indicators.priceDigits)}形成价格对子并严格创可用历史新高；${waitingReason}`, { confirmed: false, priority: 515 }));
    }
    if (shapeExitEligible && patterns.currentShape.longUpper && patterns.previousBigBull && volume) signals.push(makeSignal('reduce_50_60', 'upper_after_big_bull', '大阳线后放量长上影', '前一日大阳线后出现放量长上影，按纪律减仓50%-60%', { confirmed: isConfirmed }));
    else if (shapeExitEligible && patterns.currentShape.longUpper && volume) signals.push(makeSignal('reduce_30', 'volume_long_upper', '放量长上影·减仓信号', '放量长上影显示资金兑现，按纪律缓慢减仓', { confirmed: isConfirmed }));
    if (current.close < indicators.previousLow20 && volume) signals.push(makeSignal('reduce_30_50', 'key_support_break', '第四层·结构破坏', `放量跌破前期突破平台/关键支撑${indicators.previousLow20.toFixed(indicators.priceDigits)}，继续减仓`));

    if (current.close < indicators.ma20) {
      if (volume) signals.push(makeSignal('reduce_30_50', 'ma20_break_volume', '第三层·趋势破坏', `量比${volumeRatio.toFixed(2)}放量跌破MA20 ${indicators.ma20.toFixed(indicators.priceDigits)}`));
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
      signals.push(volume
        ? makeSignal('warning', 'ma10_break_volume', '第二层·趋势转弱', '放量跌破MA10，警示观察')
        : makeSignal('hold_no_sell', 'ma10_break_no_volume', '跌破MA10暂不动作', '未放量，按纪律暂不卖出'));
    }

    if (rising && shrink) signals.push(makeSignal('hold', 'volume_price_up_shrink', '上涨缩量·持有', '上涨缩量，可持有但不追高', { priority: 130 }));
    if (falling && shrink) signals.push(makeSignal('hold_no_sell', 'volume_price_down_shrink', '下跌缩量·观察支撑', '下跌缩量属于正常回踩，观察MA10/MA20支撑', { priority: 135 }));
    if (patterns.stagnant) signals.push(makeSignal('warning', 'volume_stagnation', '放量滞涨', '量比≥1.3、涨幅不足1%且接近前高，警惕高位换手'));

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
    if (chaseBlocked) signals.push(makeSignal('hold', 'no_chase', '持有观望·禁止追高', `${chaseReasons.join('；')}，已有仓位可持有，但禁止新增仓位`, { scope: 'entry', priority: 110 }));

    const nearMa10 = indicators.ma10 > 0 && Math.abs(current.low - indicators.ma10) / indicators.ma10 < 0.015;
    const nearMa20 = indicators.ma20 > 0 && Math.abs(current.low - indicators.ma20) / indicators.ma20 < 0.015;
    const pullbackShape = patterns.currentShape.hammer || patterns.bullishEngulfing;
    const pullbackWarning = shrink && (nearMa10 || nearMa20) && pullbackShape;
    const pullbackConfirmed = previousPullbackSetup(indicators) && (current.close > current.open || current.close > indicators.ma5);
    const entryVolumeRatio = indicators.volumeConfirmationRatio;
    const trendBreakout = current.high > indicators.previousHigh20 && entryVolumeRatio >= 1.3 && entryVolumeRatio <= 1.8 && indicators.bullishAlignment;
    const volumePriceUp = rising && volume && current.close >= indicators.ma5;
    const reversal = patterns.morningStar && current.close > indicators.previousHigh20 && current.volume > (indicators.prior.at(-1)?.volume || Infinity);
    const recentChanges = indicators.series.slice(-4).map((bar, index, sample) => index === 0 ? 0 : (sample[index - 1].close - bar.close) / sample[index - 1].close).slice(1);
    const declineFading = recentChanges.length === 3 && recentChanges[0] > recentChanges[1] && recentChanges[1] > recentChanges[2] && recentChanges[2] > 0;
    const oversoldBase = (indicators.rsi14 < 30 || indicators.deviationMa20 < -0.10) && declineFading;
    const sectorStable = context.sectorStable === true;
    const dAdd = detectDAdd(indicators);
    const addCandidates = [];
    if (volumePriceUp) addCandidates.push(makeSignal('add', 'volume_price_up', '量价确认·可加仓', '上涨放量且MA5趋势线完整，按纪律进入加仓条件', { scope: 'entry', priority: 410, details: { mode: 'volume_price' } }));
    if (trendBreakout) addCandidates.push(makeSignal('add', 'entry_breakout', '第1档·趋势突破', `突破20日新高并放量${entryVolumeRatio.toFixed(2)}倍，均线多头排列`, { scope: 'entry', priority: 425, details: { mode: 'breakout' } }));
    if (pullbackConfirmed) addCandidates.push(makeSignal('add', 'entry_pullback_confirmed', '第2档·回踩确认', '前一日缩量回踩支撑并出现止跌形态，今日重新转强', { scope: 'entry', priority: 435, details: { mode: 'pullback' } }));
    else if (pullbackWarning) addCandidates.push(makeSignal('wait_add', 'entry_pullback_wait', '回踩预警', '缩量触及MA10/MA20并出现止跌形态，等待次日确认', { scope: 'entry', confirmed: false, details: { mode: 'pullback' } }));
    if (reversal) addCandidates.push(makeSignal('add', 'entry_reversal', '第1档·反转形态', '早晨星后突破20日前高且成交量改善', { scope: 'entry', priority: 420, details: { mode: 'reversal' } }));
    if (oversoldBase) addCandidates.push(makeSignal(sectorStable ? 'add' : 'wait_add', 'entry_oversold', '超跌反弹候选', sectorStable ? '超跌、下跌衰减且板块企稳，仅建议≤20%小仓' : '超跌和下跌衰减成立，但板块企稳尚未确认', { scope: 'entry', confirmed: sectorStable, details: { mode: 'oversold' } }));
    if (dAdd) addCandidates.push(makeSignal('d_add', 'entry_d_add', '反弹补仓·D档加仓', '破位后2-3根K线不创新低，当前反弹收阳，按纪律执行D档加仓；不计算具体数量', { scope: 'entry', details: { mode: 'd_add' } }));

    const riskBlocksAdding = signals.some((signal) => signal.priority >= ACTIONS.warning.priority);
    addCandidates.forEach((candidate) => {
      if (chaseBlocked || riskBlocksAdding) return;
      signals.push(candidate);
    });

    if (signals.length === 0) signals.push(makeSignal('hold', 'default_hold', '纪律判断', '未触发加仓、减仓或离场条件，按纪律持有观察'));
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
