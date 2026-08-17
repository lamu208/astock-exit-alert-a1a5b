(function attachTradingCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TradingCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createTradingCore() {
  const ACTIONS = {
    unavailable: { label: '���ݲ�����', tone: 'unavailable', priority: -1 },
    hold: { label: '���й���', tone: 'hold', priority: 100 },
    hold_no_sell: { label: '�����۲�', tone: 'hold', priority: 120 },
    add: { label: '����Ӳ�', tone: 'add', priority: 400 },
    d_add: { label: 'D���Ӳ�', tone: 'add', priority: 390 },
    wait_add: { label: '�ȴ��Ӳ�ȷ��', tone: 'warning', priority: 440 },
    warning: { label: '��ʾ�۲�', tone: 'warning', priority: 500 },
    reduce_30: { label: '����30%', tone: 'reduce', priority: 710 },
    reduce_30_50: { label: '����30%-50%', tone: 'reduce', priority: 760 },
    reduce_50_60: { label: '����50%-60%', tone: 'reduce', priority: 820 },
    reduce_half: { label: '��һ��', tone: 'reduce', priority: 840 },
    exit_60_70: { label: '��60%-70%', tone: 'reduce', priority: 880 },
    clear: { label: '�������', tone: 'clear', priority: 1000 }
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
    risingVolume: 480,
    stagnation: 520,
    fallingShrink: 170,
    risingShrink: 160
  };

  const DISCIPLINE_SECTIONS = [
    {
      title: '?? �볡��ģʽ �� �������Ӳ� �� ���ݽ��볡',
      groups: [
        {
          title: '1. �볡ģʽ',
          items: [
            ['�� ����ͻ��', 'ͻ��20���¸� + ������1.3��1.8���� + MA5>MA10>MA20'],
            ['�� �ز�ȷ��', '�����ز�MA5/MA10/MA20 + ������/��û + ����תǿ�����ȼ���ߣ�'],
            ['�� ��ת��̬', '�糿�� + ����ͻ��ǰ�� + ��������'],
            ['�� ��������', '�ɼ۳��� + �µ�˥�� + ������ȣ�����20%С�֣�']
          ]
        },
        {
          title: '2. �Ӳֽ�����',
          items: [
            ['��1����30%-40%��', '��ʼͻ�ƽ����ײ�'],
            ['��2����20%-30%��', '�����ز�֧�� + ֹ��ȷ��'],
            ['��3����10%-20%��', '����ͻ��ǰ�� + ��ͷ���б���']
          ]
        },
        {
          title: '3. �볡���ݽ�',
          items: [
            ['�� ���ܼ���', '����MA5 �� �����۲죨������'],
            ['�� ����ת��', '��������MA10 �� �ݲ���������������MA10 �� ��ʾ�۲�'],
            ['�� �����ƻ�', '��������MA20 �� ����30%-50%���������� �� �ȹ۲�'],
            ['�� �ṹ�ƻ�', '��������ǰ��ͻ��ƽ̨/�ؼ�֧�� �� ��������'],
            ['�� ���Ʒ�ת', 'MA5']
          ]
        }
      ],
      notes: [
        ['����ԭ��', '�������� �� ����ȷ�� �� �ز����� �� �������� �� ���ǼӲ� �� ��λ����'],
        ['��ֹ׷��', '����3�������ߡ��ɼ۾���MA20��10%-12%���ž�������Ӱ�ߡ������ǵ������']
      ]
    },
    {
      title: '?? �볡������������ȼ�',
      groups: [
        {
          title: '1. ���۹�ϵ�жϣ����ȼ���ߣ�',
          items: [
            ['���Ƿ���', '����ȷ�ϣ��ɼӲ֣�'],
            ['��������', '�ɳ��У���׷�ߣ�'],
            ['�µ�����', '�����زȣ��۲�֧�ţ�'],
            ['��������', '�����λ���֣���ʾ�źţ�'],
            ['��������Ӱ', '�����ʽ���֣������źţ�'],
            ['��������MA20', '���Ʒ��գ�����30%-50%��']
          ]
        },
        {
          title: '2. �������ƻ���MA5Ϊ���ģ�',
          items: [
            ['������MA5', '�۲죨������'],
            ['������MA5 + δ�ջ�', '����30%��ֹ��'],
            ['��λ��2-3��K�߲����µ�', '�������֣�D���Ӳ֣�']
          ]
        },
        {
          title: '3. K������̬',
          items: [
            ['����Ӱ�� + �����ߺ� + ����', '����50%-60%'],
            ['���Ӷ� + ����', '��60%-70%'],
            ['���˳���Ӱ��', '�������'],
            ['�۸���Ӷ�������ʷ�¸ߣ�', '�������Ǻ�β��������߼��ϸ񴴿�����ʷ�¸� + ��������Ӱ�� �� ��һ�룻δ���¸ߺͷ���;�о�����ʾ']
          ]
        },
        {
          title: '4. ����˳�򣨱��밴�գ�',
          items: [
            ['��', '�������������� �� ��������/���'],
            ['��', '������������ �� �ж�K����̬'],
            ['��', 'K�߳��־�ʾ �� �۲��Ƿ�������'],
            ['��', '������ʾ�ź� �� ��������'],
            ['��', '�޾�ʾ�ź� �� �����������ɿɳ���/�Ӳ�']
          ]
        }
      ],
      notes: [
        ['��ֹ׷��', '����3+�����ߣ��ɼ۾���MA20��10%���ž�������Ӱ�������ǰ���������̸�λ����'],
        ['�������', '��MA5���������ߡ�5�վ������ɽ�����׼���볡������������+����']
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
    return /ETF|LOF|����/i.test(name) || /^(15|16|50|51|52|56|58|59)\d{4}$/.test(code) ? 'ETF' : 'STOCK';
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
    const riseThreshold = securityType === 'ETF' ? 0.08 : 0.15;
    const candidate = bars[lastIndex];
    if (!isPairedPriceTop(candidate.high, securityType)) return none;

    const prior = bars.slice(0, lastIndex);
    const stage = prior.slice(-120);
    const historicalHigh = Math.max(...prior.map((bar) => bar.high));
    const stageLow = Math.min(...stage.map((bar) => bar.low));
    const riseFromStageLow = stageLow > 0 ? candidate.high / stageLow - 1 : 0;
    const isHistoricalHigh = historicalHigh > 0 && candidate.high > historicalHigh;

    // ֻ���������Ǻ��ϸ񴴿�����ʷ�¸ߣ�δ���¸߻򷴵�;�в���ʾ��
    if (!isHistoricalHigh || riseFromStageLow < riseThreshold) return none;

    const shape = candleShape(candidate, securityType);
    if (!shape.longUpper || shape.doji) return none;

    const baselineVolume = average(prior.slice(-5).map((bar) => bar.volume));
    const volumeRatio = baselineVolume > 0 ? candidate.volume / baselineVolume : NaN;
    const historicalMaxVolume = Math.max(...prior.map((bar) => bar.volume));
    const historicalVolumeHigh = candidate.volume > 0
      && historicalMaxVolume > 0
      && candidate.volume > historicalMaxVolume;
    const volumeConfirmed = volumeRatio >= 1.3 || historicalVolumeHigh;
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
    if (!Number.isFinite(ratio) || ratio <= 0) return 'δ֪';
    if (ratio < 0.8) return '����';
    if (ratio < 1) return 'ƽ��';
    if (ratio < 1.3) return '�ºͷ���';
    if (ratio < 2) return '����';
    return '����';
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
    if (marketData?.data_quality?.valid === false) missing.push(marketData.data_quality.error || '�������ݱ��Ϊ��Ч');
    if (marketData?.data_quality?.conflict) missing.push('˫Դ�����ͻ');
    const quote = marketData?.quote || {};
    const numericFields = ['price', 'open', 'high', 'low', 'volume'];
    numericFields.forEach((field) => {
      const value = finiteNumber(quote[field]);
      if (!Number.isFinite(value) || value < 0 || (field !== 'volume' && value <= 0)) missing.push(`ȱ��${field}`);
    });
    if (finiteNumber(quote.high) < finiteNumber(quote.low)) missing.push('��߼۵�����ͼ�');
    if (!indicators || indicators.series.length < 20) missing.push('��ʷK�߲���20��');
    if (!indicators || ![indicators.ma5, indicators.ma10, indicators.ma20].every(Number.isFinite)) missing.push('�ؼ����߲���');
    if (!indicators || !Number.isFinite(indicators.volumeRatio)) missing.push('�ɽ�����׼����');
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
    if (!marketData) return { status: 'unknown', effectiveStatus: 'unknown', risk: false, reason: '�������ݲ�����' };
    const indicators = calculateIndicators(marketData);
    const quality = validateMarketData(marketData, indicators);
    if (!quality.valid || indicators.series.length < 25) return { status: 'unknown', effectiveStatus: 'unknown', risk: false, reason: quality.missing.join('��') || '�������ݲ���' };
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
      reason: risk ? '���̷��մ�����������λ�źŽ�һ��' : status === 'bull' ? '���̶�ͷ' : status === 'bear' ? '���̿�ͷ' : '������'
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
    const previousMa5 = movingAverage(indicators.series, 5, 1);
    const previousMa10 = movingAverage(indicators.series, 10, 1);
    const previousMa20 = movingAverage(indicators.series, 20, 1);
    const volumePeriod = 5;
    const previousBaseline = average(indicators.series.slice(-(volumePeriod + 2), -2).map((bar) => bar.volume));
    const previousRatio = previousBaseline > 0 ? previous.volume / previousBaseline : NaN;
    const nearSupport = [previousMa5, previousMa10, previousMa20].some((ma) => ma > 0 && Math.abs(previous.low - ma) / ma < 0.015);
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
    const primary = sorted[0] || makeSignal('hold', 'default_hold', '�����ж�', 'δ�����Ӳ֡����ֻ��볡����');
    const secondary = sorted.filter((signal) => signal !== primary).slice(0, 2);
    return { primary, secondary, all: sorted };
  }

  function evaluateInstrument(marketData, context = {}) {
    const indicators = calculateIndicators(marketData);
    const quality = validateMarketData(marketData, indicators);
    if (!quality.valid) {
      const primary = makeSignal('unavailable', 'data_quality', '���ݲ�����', quality.missing.join('��'), { confirmed: false, scope: 'data' });
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
    const market = context.market || { status: 'unknown', effectiveStatus: 'unknown', risk: false, reason: '�������ݲ�����' };

    if (shapeExitEligible && patterns.currentShape.extremeUpper) signals.push(makeSignal('clear', 'extreme_upper_shadow', '���˳���Ӱ��', '��Ӱ�߳���ʵ��3���ҳ������̼�3%���������������', { confirmed: isConfirmed }));
    if (indicators.deathCross && volume) signals.push(makeSignal('clear', 'ma5_death_cross', '����㡤���Ʒ�ת', 'MA5���Ϸ��´�MA10��������ȷ�ϣ�����������볡', { confirmed: isConfirmed }));
    else if (indicators.deathCross) signals.push(makeSignal('warning', 'ma5_death_cross_wait_volume', '���Ʒ�ת������ȷ��', 'MA5���´�MA10������δ�ﵽ����ȷ�ϱ�׼���Ⱦ�ʾ�۲�', { confirmed: false }));
    if (shapeExitEligible && patterns.klineDoubleTop) {
      if (volume) {
        const volumeReason = indicators.historicalVolumeHigh
          ? '���ճɽ�����������ʷ�¸�'
          : `���ճɽ����ﵽǰ5�վ�����${indicators.volumeConfirmationRatio.toFixed(2)}��`;
        signals.push(makeSignal('exit_60_70', 'kline_double_top_confirmed', 'K��˫����������60%-70%', `����۸�ӽ����м�س���3%�ҵڶ���ת����${volumeReason}�������ɳ�60%-70%`, { confirmed: isConfirmed }));
      } else {
        signals.push(makeSignal('hold', 'kline_double_top_wait_volume', 'K��Mͷ˫����ѡ�����й۲�', 'Mͷ�ṹ��Ϊ��ѡ����������δȷ������δ�γ���Ч��λ�����й۲죬������', { confirmed: false, priority: 115 }));
      }
    }
    const pairedPrice = patterns.pairedPriceSetup;
    if (pairedPrice.active && pairedPrice.confirmed) {
      const volumeReason = pairedPrice.historicalVolumeHigh
        ? '�����ճɽ�����������ʷ�¸�'
        : `�����ճɽ����ﵽǰ5�վ�����${pairedPrice.volumeRatio.toFixed(2)}��`;
      signals.push(makeSignal('reduce_half', 'paired_price_top_confirmed', '��ʷ�¸߼۸���Ӷ�����һ��', `�������Ǻ���߼�${pairedPrice.price.toFixed(indicators.priceDigits)}�γɼ۸���Ӳ��ϸ񴴿�����ʷ�¸ߣ������������Ӱ��${volumeReason}�������ɳ�һ��`, { confirmed: true }));
    }
    if (shapeExitEligible && patterns.currentShape.longUpper && patterns.previousBigBull && volume) signals.push(makeSignal('reduce_50_60', 'upper_after_big_bull', '�����ߺ��������Ӱ', 'ǰһ�մ����ߺ���ַ�������Ӱ�������ɼ���50%-60%', { confirmed: isConfirmed }));
    else if (shapeExitEligible && patterns.currentShape.longUpper && volume) signals.push(makeSignal('reduce_30', 'volume_long_upper', '��������Ӱ�������ź�', '��������Ӱ��ʾ�ʽ���֣������ɻ�������', { confirmed: isConfirmed }));
    if (current.close < indicators.previousLow20 && volume) signals.push(makeSignal('reduce_30_50', 'key_support_break', '���Ĳ㡤�ṹ�ƻ�', `��������ǰ��ͻ��ƽ̨/�ؼ�֧��${indicators.previousLow20.toFixed(indicators.priceDigits)}����������`));

    if (current.close < indicators.ma20) {
      if (volume) signals.push(makeSignal('reduce_30_50', 'ma20_break_volume', '�����㡤�����ƻ�', `����${volumeRatio.toFixed(2)}��������MA20 ${indicators.ma20.toFixed(indicators.priceDigits)}`));
      else if (shrink) signals.push(makeSignal('hold_no_sell', 'ma20_break_shrink', '��������MA20', '������λ���ȹ۲죬��ֱ�Ӽ���'));
      else signals.push(makeSignal('warning', 'ma20_break_unconfirmed_volume', '����MA20������ȷ��', '����δ�ﵽ������׼���ݰ���ʾ�۲�'));
    }

    if (current.close < indicators.ma5) {
      if (volume && isConfirmed) signals.push(makeSignal('reduce_30', 'ma5_break_volume', '��������MA5', `����${volumeRatio.toFixed(2)}������δ�ջ�MA5�������ɼ���30%`));
      else if (volume) signals.push(makeSignal('warning', 'ma5_break_intraday', '���з�������MA5', '���ж�̬�źţ��ȴ�����ȷ��', { confirmed: false }));
      else if (shrink) signals.push(makeSignal('hold_no_sell', 'ma5_break_shrink', '��һ�㡤���ܼ���', '��������MA5�����۲죬����'));
      else signals.push(makeSignal('warning', 'ma5_break_mild', '����MA5��ȷ��', '���ܲ�����ȷ����λ�������۲�'));
    }

    if (current.close < indicators.ma10 && current.close >= indicators.ma20) {
      signals.push(volume
        ? makeSignal('warning', 'ma10_break_volume', '�ڶ��㡤����ת��', '��������MA10����ʾ�۲�')
        : makeSignal('hold_no_sell', 'ma10_break_no_volume', '����MA10�ݲ�����', 'δ�������������ݲ�����'));
    }

    if (rising && shrink) signals.push(makeSignal('hold', 'volume_price_up_shrink', '�������ȡ���������', '�����������ɳ��е���׷��', { priority: VOLUME_PRICE_PRIORITIES.risingShrink }));
    if (falling && shrink) signals.push(makeSignal('hold_no_sell', 'volume_price_down_shrink', '�������ȡ��µ�����', '�µ��������������زȣ��۲�MA5/MA10/MA20֧��', { priority: VOLUME_PRICE_PRIORITIES.fallingShrink }));
    if (patterns.stagnant) signals.push(makeSignal('warning', 'volume_stagnation', '�������ȡ���������', '���ȡ�1.3���Ƿ�����1%�ҽӽ�ǰ�ߣ������λ����', { priority: VOLUME_PRICE_PRIORITIES.stagnation }));

    const stockDeviationLimit = indicators.securityType === 'ETF' ? 0.12 : 0.10;
    const sectorWeak = indicators.securityType === 'STOCK' && indicators.change > 0.02 && finiteNumber(context.sectorChange) < 0;
    const chaseReasons = [
      patterns.threeBigBull && '����3��������',
      indicators.deviationMa20 > stockDeviationLimit && `����MA20����${stockDeviationLimit * 100}%`,
      hugeVolume && patterns.currentShape.longUpper && '�ž�������Ӱ��',
      sectorWeak && '�����ǵ������',
      market.highVolume && '���̸�λ����'
    ].filter(Boolean);
    const chaseBlocked = chaseReasons.length > 0;
    if (chaseBlocked) signals.push(makeSignal('hold', 'no_chase', '���й�������ֹ׷��', `${chaseReasons.join('��')}�����в�λ�ɳ��У�����ֹ������λ`, { scope: 'entry', priority: 110 }));

    const supportLevels = [
      { label: 'MA5', value: indicators.ma5 },
      { label: 'MA10', value: indicators.ma10 },
      { label: 'MA20', value: indicators.ma20 }
    ];
    const touchedSupport = supportLevels.find((support) => support.value > 0
      && Math.abs(current.low - support.value) / support.value < 0.015);
    const nearMa5 = touchedSupport?.label === 'MA5';
    const nearMa10 = touchedSupport?.label === 'MA10';
    const nearMa20 = touchedSupport?.label === 'MA20';
    const pullbackShape = patterns.currentShape.hammer || patterns.bullishEngulfing;
    const pullbackWarning = shrink && (nearMa5 || nearMa10 || nearMa20) && pullbackShape;
    const candleRange = current.high - current.low;
    const supportRecovered = Boolean(touchedSupport)
      && shrink
      && indicators.bullishAlignment
      && current.close > current.open
      && current.close >= touchedSupport.value
      && (current.close - current.open) / touchedSupport.value >= 0.01
      && candleRange > 0
      && (current.close - current.low) / candleRange >= 0.55;
    const previousPullbackConfirmed = previousPullbackSetup(indicators)
      && (current.close > current.open || current.close > indicators.ma5);
    const pullbackConfirmed = previousPullbackConfirmed || supportRecovered;
    const entryVolumeRatio = indicators.volumeConfirmationRatio;
    const trendBreakout = current.high > indicators.previousHigh20 && entryVolumeRatio >= 1.3 && entryVolumeRatio <= 1.8 && indicators.bullishAlignment;
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
      && volumeVsPrevious >= 1.2;
    const volumePriceUp = rising && volume && current.close >= indicators.ma5;
    const reversal = patterns.morningStar && current.close > indicators.previousHigh20 && volume && indicators.bullishAlignment;
    const recentChanges = indicators.series.slice(-4).map((bar, index, sample) => index === 0 ? 0 : (sample[index - 1].close - bar.close) / sample[index - 1].close).slice(1);
    const declineFading = recentChanges.length === 3 && recentChanges[0] > recentChanges[1] && recentChanges[1] > recentChanges[2] && recentChanges[2] > 0;
    const oversoldBase = (indicators.rsi14 < 30 || indicators.deviationMa20 < -0.10) && declineFading;
    const sectorStable = context.sectorStable === true;
    const dAdd = detectDAdd(indicators);
    const addCandidates = [];
    if (volumePriceUp) addCandidates.push(makeSignal('add', 'volume_price_up', '�������ȡ����Ƿ������ɼӲ֣�', `�����ҳɽ����ﵽ������׼��MA5���������������ƻ������ȷ��`, { scope: 'entry', priority: VOLUME_PRICE_PRIORITIES.risingVolume, details: { mode: 'volume_price', rank: 0 } }));
    if (trendBreakout) addCandidates.push(makeSignal('add', 'entry_breakout', '�ڶ����ȼ�������ͻ�ƣ�30%-40%��', `ͻ��20���¸߲�����${entryVolumeRatio.toFixed(2)}����MA5>MA10>MA20����ʼͻ�ƽ����ײ�`, { scope: 'entry', priority: ENTRY_PRIORITIES.trendBreakout, details: { mode: 'breakout', allocation: '30%-40%', rank: 2 } }));
    if (pullbackConfirmed) {
      const pullbackReason = supportRecovered
        ? `�����ز�${touchedSupport.label}������������֧�ţ�ֹ������תǿ`
        : 'ǰһ�������ز�MA5/MA10/MA20�����ִ����߻���û��̬����������תǿ';
      addCandidates.push(makeSignal('add', 'entry_pullback_confirmed', '������ȼ����ز�ȷ�ϣ�20%-30%��', `${pullbackReason}������2���زȼӲ�`, { scope: 'entry', priority: ENTRY_PRIORITIES.pullbackConfirmed, details: { mode: 'pullback', allocation: '20%-30%', rank: 1, support: touchedSupport?.label || null } }));
    }
    else if (pullbackWarning) addCandidates.push(makeSignal('wait_add', 'entry_pullback_wait', '������ȼ���ѡ���ȴ��ز�ȷ��', '��������MA5/MA10/MA20�����ִ����߻���û��̬���ȴ�����תǿ���ټӲ�20%-30%', { scope: 'entry', priority: ENTRY_PRIORITIES.pullbackWaiting, confirmed: false, details: { mode: 'pullback', allocation: '20%-30%', rank: 1 } }));
    if (localBreakout) addCandidates.push(makeSignal('add', 'entry_local_breakout', '�ص���ͻ�ƽ�5�ոߵ㡤��3���Ӳ֣�10%-20%��', `����ͻ�ƽ�5�ոߵ�${previousHigh5.toFixed(indicators.priceDigits)}��MA5>MA10>MA20���ɽ�����ǰһ�ո���${volumeVsPrevious.toFixed(2)}��`, { scope: 'entry', priority: ENTRY_PRIORITIES.localBreakout, details: { mode: 'local_breakout', allocation: '10%-20%', rank: 3 } }));
    if (reversal) addCandidates.push(makeSignal('add', 'entry_reversal', '�������ȼ�����ת��̬��10%-20%��', '�糿�Ǻ����ͻ��20��ǰ�ߣ��ɽ��������Ҷ�ͷ���б���', { scope: 'entry', priority: ENTRY_PRIORITIES.reversal, details: { mode: 'reversal', allocation: '10%-20%', rank: 3 } }));
    if (oversoldBase) addCandidates.push(makeSignal(sectorStable ? 'add' : 'wait_add', 'entry_oversold', '�������ȼ���������������20%С�֣�', sectorStable ? '�ɼ۳������µ�˥���Ұ�����ȣ��������20%С��' : '�������µ�˥�������������������δȷ�ϣ��ݲ��Ӳ�', { scope: 'entry', priority: ENTRY_PRIORITIES.oversold, confirmed: sectorStable, details: { mode: 'oversold', allocation: '��20%', rank: 4 } }));
    if (dAdd) addCandidates.push(makeSignal('d_add', 'entry_d_add', '�������֡�D���Ӳ�', '��λ��2-3��K�߲����µͣ���ǰ����������������ִ��D���Ӳ֣��������������', { scope: 'entry', priority: ENTRY_PRIORITIES.dAdd, details: { mode: 'd_add' } }));

    const riskBlocksAdding = signals.some((signal) => signal.priority >= ACTIONS.warning.priority);
    addCandidates.forEach((candidate) => {
      const confirmedPullback = candidate.ruleId === 'entry_pullback_confirmed';
      if ((chaseBlocked && !confirmedPullback) || riskBlocksAdding) return;
      signals.push(candidate);
    });

    if (signals.length === 0) signals.push(makeSignal('hold', 'default_hold', '�����ж�', 'δ�����Ӳ֡����ֻ��볡�����������ɳ��й۲�'));
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

