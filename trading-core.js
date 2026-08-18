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
    reduce_30_40: { label: '����30%-40%', tone: 'reduce', priority: 735 },
    reduce_30_50: { label: '����30%-50%', tone: 'reduce', priority: 760 },
    reduce_50_60: { label: '����50%-60%', tone: 'reduce', priority: 820 },
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
    preBreakoutStrength: 230,
    risingVolume: 105,
    stagnation: 520,
    fallingShrink: 170,
    risingShrink: 160
  };

  const DISCIPLINE_SECTIONS = [
    {
      title: '?? ǰ����բ�����̻������ˣ������������ڣ�',
      groups: [
        {
          title: '����״̬��ɲ�����Χ',
          items: [
            ['��ͷ�г�', 'ָ��>MA20 �� MA5>MA10 �� �٢ڢۢ�ȫ���ɲ���'],
            ['����', 'ָ����MA20�������� �� �٢ڢۿɲ������ܲ�λ��60%'],
            ['��ͷ�г�', 'ָ��<MA20 �� ���ܳ��������ɲ������ܲ�λ��20%���٢ڢ���ͣ']
          ]
        }
      ],
      notes: [['ִ��ԭ��', '�ȹ�������բ�����жϸ����볡������״̬����ʱ��ͣ������λ']]
    },
    {
      title: '?? �볡��ģʽ �� �������Ӳ� �� ���ݽ��˳��������������ڣ�',
      groups: [
        {
          title: '1. �볡ģʽ',
          items: [
            ['�� ����ͻ��', 'ͻ��20���¸� + ���������ȡ�1.3����1.8Ϊǿ��������2.5Ϊ�ž����� + MA5>MA10>MA20'],
            ['�� �ز�ȷ��', '�����ز�MA5/MA10/MA20 + ������/��û + ����תǿ��ʤ����ߣ�'],
            ['�� ��ת��̬', '�糿�� + ����ͻ��ǰ�� + �������ƣ�������>ǰ���������ȡ�1.3��'],
            ['�� ��������', '�ɼ۳��� + �µ�˥�� + ������ȣ�����20%С�֣�']
          ]
        },
        {
          title: '2. �Ӳֽ��������̶���λ�ƣ�',
          items: [
            ['��1����40%��', '��ʼͻ�ƽ����ײ֣�ֹ��ͻ��K����͵�'],
            ['��2������֧��λ��', '�����ز�֧�� + ֹ��ȷ�ϣ�MA5���Ƽ�25%��MA10���Ƽ�20%��MA20���Ƽ�15%��ֹ��֧��λ�·�1%-2%'],
            ['��3����15%��', '����ͻ��ǰ�� + ��ͷ���б��֣�ֹ��MA10'],
            ['��D��', '��λ��2-3��K�߲����µ� �� �������֣����Ѽ��ֲ��ֵ�30%-50%�ز���ֹ�𣺷����µ�'],
            ['�ֽ𴢱���20%��', '�����ã�Ӧ������']
          ]
        },
        {
          title: '3. �볡���ݽ�',
          items: [
            ['�� ���ܼ���', '��������MA5 �� �����۲죨����������������MA5�ҵ���δ�ջ� �� ����30%��ֹ��'],
            ['�� ����ת��', '��������MA10 �� �ݲ���������������MA10 �� ����30%-40%'],
            ['�� �����ƻ�', '��������MA20 �� ����30%-50%���������� �� �ȹ۲�'],
            ['�� �ṹ�ƻ�', '��������ǰ��ͻ��ƽ̨/�ؼ�֧�� �� ��������'],
            ['�� ���Ʒ�ת', 'MA5�´�MA10�����棩+ ���� �� ���ʣ���λ']
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
          title: '1. �������ȣ�����ȷ��',
          items: [
            ['��������', '�������볡'],
            ['�������� + ͻ�ƹؼ�λ', '�����Ӳ��ж�'],
            ['��������', '�ɳ��У���׷�ߣ�'],
            ['�µ�����', '�����زȣ��۲�֧�ţ�'],
            ['�����µ� + ����MA10', '������չ۲�'],
            ['�����µ� + ����MA20', '����30%-50%'],
            ['�����µ� + ���ƹؼ�ƽ̨/ǰ��ͻ��λ', '��������'],
            ['��������', '�����λ���֣���ʾ�źţ�'],
            ['��������Ӱ', '�����ʽ���֣������źţ�']
          ]
        },
        {
          title: '2. ͻ��ǰ���� / ǿ��תǿ���ֲ�״̬ʶ��',
          items: [
            ['��������', '�ɼ�>MA5 + MA5>MA10>MA20 + ��ǰ3-5����Ҫ��MA5������������ + �����ڼ�δ��Ч����MA10 + ��������������תǿ + ���ȡ�1.20 + ��δͻ��20���¸�'],
            ['ϵͳ����', '���й�����ǿ��תǿ'],
            ['ʶ��˵��', 'MA5������������ �� ����תǿ����δͻ��20���¸ߣ��ȴ�ͻ��ȷ��']
          ]
        },
        {
          title: '3. �������ƻ���MA5Ϊ���ģ�',
          items: [
            ['������MA5', '�۲죨������'],
            ['������MA5�����ȡ�1.3��+ ����δ�ջ�', '����30%��ֹ��'],
            ['��λ��2-3��K�߲����µ�', '�������֣�D���Ӳ֣�'],
            ['��λ��2-3��K��Խ��Խ��', 'ȫ���볡']
          ]
        },
        {
          title: '4. K������̬',
          items: [
            ['����Ӱ�� + �����ߺ� + ����', '����50%-60%'],
            ['K��˫�� + ���¸� + ����', '��60%-70%��δ���¸߻�ص�;�в���ʾ'],
            ['���˳���Ӱ��', '�������'],
            ['�۸���Ӷ� + ����������ʷ�¸ߣ�', '�������Ǻ�β��������߼��ϸ񴴿�����ʷ�¸� + ��������Ӱ�� �� ��60%-70%��δ���¸ߺͷ���;�о�����ʾ'],
            ['����������/��ͣ�����ճ�����ӰС����', '������һ���֣���������һ���'],
            ['����������/��ͣ�󣺼�����Ӱ��ʵ�弸��û��', '������һ���֣���������һ���']
          ]
        },
        {
          title: '5. �̿ھ�ʾ������������/��ͣ�ߺ�',
          items: [
            ['�������̿�', '����������̬������ �� ������һ���֣���������һ���'],
            ['��ǿ���̿�', '���̼�������������ͣ/ը�� �� ������һ���֣���������һ���'],
            ['�쳣�̿�', '��ߵ���ֶ��Ӷ������������� �� ������һ���֣���������һ���']
          ]
        },
        {
          title: '6. ����˳�򣨱��밴�գ�',
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
        ['�����ж�', '���������ߡ�K�ߡ��̿�����ͬʱ�жϣ�������������Ϊ�������ɵ���������˳��Ŷ���'],
        ['��������', '���źŵ���ʱ�������ۼƼ��֡�ʣ���λ��70%����ȷ��ֹ������'],
        ['�����߻���', '����������ͻ���������ǵ㻭�ߣ�ȡ�Ӵ�ʵ������ֱ�ߣ�����ṹ�Ƶײ����볡��MA5Ϊ�������'],
        ['��ֹ׷��', '����3+�����ߣ��ɼ۾���MA20��10%���ž�������Ӱ�������ǰ���������̸�λ����'],
        ['�������', '��MA5���������ߡ�5�վ������ɽ�����׼������=���ȡ�1.3����1.8Ϊǿ��������2.5Ϊ�ž��������볡������������+���ܣ��̿����������Դ�ṩ���нṹʱ����']
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
    if (!Number.isFinite(ratio) || ratio <= 0) return 'δ֪';
    if (ratio < 0.8) return '����';
    if (ratio < 1) return 'ƽ��';
    if (ratio < 1.3) return '�ºͷ���';
    if (ratio < 1.8) return '����';
    if (ratio < 2.5) return 'ǿ����';
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
    if (!marketData) return { status: 'unknown', effectiveStatus: 'unknown', risk: false, positionCap: 0, allowedModes: [], reason: '�������ݲ����ã���ͣ������λ' };
    const indicators = calculateIndicators(marketData);
    const quality = validateMarketData(marketData, indicators);
    if (!quality.valid || indicators.series.length < 25) return { status: 'unknown', effectiveStatus: 'unknown', risk: false, positionCap: 0, allowedModes: [], reason: `${quality.missing.join('��') || '�������ݲ���'}����ͣ������λ` };
    const ma20FiveDaysAgo = movingAverage(indicators.series, 20, 5);
    const slope = ma20FiveDaysAgo > 0 ? (indicators.ma20 / ma20FiveDaysAgo - 1) / 5 : 0;
    let status = 'sideways';
    if (indicators.current.close > indicators.ma20 && indicators.ma5 > indicators.ma10) status = 'bull';
    else if (indicators.current.close < indicators.ma20) status = 'bear';
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
      ? '���̶�ͷ���٢ڢܾۢ��ɲ���'
      : status === 'bear'
        ? '���̿�ͷ�����ܳ��������ɲ������ܲ�λ��20%'
        : '�����𵴣��٢ڢۿɲ������ܲ�λ��60%';
    return {
      status,
      effectiveStatus,
      risk,
      highVolume,
      slope,
      ma20: indicators.ma20,
      positionCap,
      allowedModes,
      reason: risk ? `${statusReason}��ͬʱ�������̷��գ���ֹ׷��` : statusReason
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
    const entryVolumeRatio = volumeRatio;
    const shrink = volumeRatio < 0.8;
    const volume = indicators.volumeConfirmed;
    const expandedVolume = Number.isFinite(entryVolumeRatio) && entryVolumeRatio >= 1.3;
    const hugeVolume = entryVolumeRatio >= 2.5;
    const rising = indicators.change > 0.001;
    const falling = indicators.change < -0.001;
    const isConfirmed = !isTradingSession(marketData.source_time);
    const shapeExitEligible = !patterns.currentShape.doji;
    const market = context.market || { status: 'unknown', effectiveStatus: 'unknown', risk: false, positionCap: 0, allowedModes: [], reason: '�������ݲ����ã���ͣ������λ' };
    const continuedDeclineAfterBreak = detectContinuedDeclineAfterBreak(indicators);

    if (continuedDeclineAfterBreak) signals.push(makeSignal('clear', 'post_break_lower_lows', '��λ��������µ͡�ȫ���볡', '����MA5������2-3��K�ߵ͵�Խ��Խ�ͣ�������ȫ���볡', { confirmed: isConfirmed }));
    if (shapeExitEligible && patterns.currentShape.extremeUpper) signals.push(makeSignal('clear', 'extreme_upper_shadow', '���˳���Ӱ��', '��Ӱ�߳���ʵ��3���ҳ������̼�3%���������������', { confirmed: isConfirmed }));
    if (indicators.deathCross && volume) signals.push(makeSignal('clear', 'ma5_death_cross', '����㡤���Ʒ�ת', 'MA5���Ϸ��´�MA10��������ȷ�ϣ�����������볡', { confirmed: isConfirmed }));
    else if (indicators.deathCross) signals.push(makeSignal('warning', 'ma5_death_cross_wait_volume', '���Ʒ�ת������ȷ��', 'MA5���´�MA10������δ�ﵽ����ȷ�ϱ�׼���Ⱦ�ʾ�۲�', { confirmed: false }));
    if (shapeExitEligible && patterns.klineDoubleTop) {
      if (volume) {
        const volumeReason = indicators.historicalVolumeHigh
          ? '���ճɽ�����������ʷ�¸�'
          : `���ȴﵽ${indicators.volumeRatio.toFixed(2)}`;
        signals.push(makeSignal('exit_60_70', 'kline_double_top_confirmed', '���¸�K��˫����������60%-70%', `�ڶ����ϸ񴴿�����ʷ�¸ߡ�����۸�ӽ����м�س���3%�ҵڶ���ת����${volumeReason}�������ɳ�60%-70%`, { confirmed: isConfirmed }));
      } else {
        signals.push(makeSignal('hold', 'kline_double_top_wait_volume', '���¸�K��˫����ѡ�����й۲�', '�ڶ������ϸ񴴿�����ʷ�¸߲��γ�Mͷ��ѡ������������δȷ�ϣ����й۲죬������', { confirmed: false, priority: 115 }));
      }
    }
    const pairedPrice = patterns.pairedPriceSetup;
    if (pairedPrice.active && pairedPrice.confirmed) {
      const volumeReason = pairedPrice.historicalVolumeHigh
        ? '�����ճɽ�����������ʷ�¸�'
        : `�����ճɽ����ﵽǰ5�վ�����${pairedPrice.volumeRatio.toFixed(2)}��`;
      signals.push(makeSignal('exit_60_70', 'paired_price_top_confirmed', '��ʷ�¸߼۸���Ӷ�����60%-70%', `�������Ǻ���߼�${pairedPrice.price.toFixed(indicators.priceDigits)}�γɼ۸���Ӳ��ϸ񴴿�����ʷ�¸ߣ������������Ӱ��${volumeReason}�������ɳ�60%-70%`, { confirmed: true }));
    }
    const postStrongRunPattern = patterns.gapSmallBullWithShadows || patterns.tinyBodyLongUpperAfterRun;
    if (shapeExitEligible && postStrongRunPattern) {
      if (volume) signals.push(makeSignal('exit_60_70', 'post_strong_run_kline_volume', '���������ߺ��쳣K�ߡ���60%-70%', '����������/��ͣ�ߺ�������ճ�����ӰС���߻򼫳���ӰСʵ�����ߣ�����������������ɳ���һ���', { confirmed: isConfirmed }));
      else if (shrink) signals.push(makeSignal('reduce_30', 'post_strong_run_kline_shrink', '���������ߺ��쳣K�ߡ���һ����', '����������/��ͣ�ߺ���־�ʾK�ߵ��ɽ���ή�����������ȼ�һ����', { confirmed: isConfirmed }));
      else signals.push(makeSignal('warning', 'post_strong_run_kline_wait_volume', '���������ߺ��쳣K�ߡ��۲�����', '����������/��ͣ�ߺ���־�ʾK�ߣ�������δ��ȷ���Ⱦ�ʾ�۲�', { confirmed: false }));
    } else if (shapeExitEligible && patterns.currentShape.longUpper && patterns.previousBigBull && volume) {
      signals.push(makeSignal('reduce_50_60', 'upper_after_big_bull', '�����ߺ��������Ӱ', 'ǰһ�մ����ߺ���ַ�������Ӱ�������ɼ���50%-60%', { confirmed: isConfirmed }));
    } else if (shapeExitEligible && patterns.currentShape.longUpper && volume) {
      signals.push(makeSignal('reduce_30', 'volume_long_upper', '��������Ӱ�������ź�', '��������Ӱ��ʾ�ʽ���֣������ɻ�������', { confirmed: isConfirmed }));
    }

    const tapeWarningNames = [
      patterns.tapeWarnings.violentOscillation && '�������̿�',
      patterns.tapeWarnings.fakeStrength && '���̼���δ��ͣ/ը��',
      patterns.tapeWarnings.abnormalOrders && '�����������쳣�̿�'
    ].filter(Boolean);
    if (tapeWarningNames.length) {
      const tapeReason = `${tapeWarningNames.join('��')}������������Դ���ṩ�����нṹ�ж�`;
      if (volume) signals.push(makeSignal('exit_60_70', 'tape_warning_volume', '�̿ھ�ʾ��������60%-70%', `${tapeReason}����������������ɳ���һ���`, { confirmed: true }));
      else if (shrink) signals.push(makeSignal('reduce_30', 'tape_warning_shrink', '�̿ھ�ʾ��������һ����', `${tapeReason}���ɽ���ή���������ɼ�һ����`, { confirmed: true }));
      else signals.push(makeSignal('warning', 'tape_warning_wait_volume', '�̿ھ�ʾ���۲�����', `${tapeReason}��������δ��ȷ���Ⱦ�ʾ�۲�`, { confirmed: false }));
    }
    if (current.close < indicators.previousLow20) {
      if (falling && volume) signals.push(makeSignal('reduce_30_50', 'key_support_break', '���Ĳ㡤�ṹ�ƻ�', `�����µ�������ǰ��ͻ��ƽ̨/�ؼ�֧��${indicators.previousLow20.toFixed(indicators.priceDigits)}�������ɼ�������`));
      else if (volume) signals.push(makeSignal('warning', 'key_support_break_wait_direction', '�ؼ�ƽ̨�·����ȴ�����ȷ��', '���ڹؼ�ƽ̨/ǰ��ͻ��λ�·��������ղ��Ƿ����µ����Ƚ�����չ۲�'));
    }

    if (current.close < indicators.ma20) {
      if (falling && volume) signals.push(makeSignal('reduce_30_50', 'ma20_break_volume', '�����㡤�����ƻ�', `����${volumeRatio.toFixed(2)}�������µ�������MA20 ${indicators.ma20.toFixed(indicators.priceDigits)}�������ɼ���30%-50%`));
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
      signals.push(falling && volume
        ? makeSignal('warning', 'ma10_break_volume', '�����µ�������MA10�����չ۲�', '������չ۲죬�ȴ��Ƿ��ջ�MA10����δ����MA20����ִ�м���')
        : makeSignal('hold_no_sell', 'ma10_break_no_volume', '����MA10�ݲ�����', 'δ�������������ݲ�����'));
    }

    if (rising && expandedVolume) signals.push(makeSignal('hold', 'volume_price_up', '�������ǡ��������볡', '��������ֻȷ�����ƣ��������볡��ֻ��ͻ��20���¸߻�ؼ�λ��Ž���Ӳ��ж�', { priority: VOLUME_PRICE_PRIORITIES.risingVolume }));
    if (rising && shrink) signals.push(makeSignal('hold', 'volume_price_up_shrink', '������������������', '���������������������ɳ��е���׷��', { priority: VOLUME_PRICE_PRIORITIES.risingShrink }));
    if (falling && shrink) signals.push(makeSignal('hold_no_sell', 'volume_price_down_shrink', '�زȹ۲졤�µ�����', '�µ��������������زȣ������ж�MA5/MA10/MA20֧���Ƿ��ջ�', { priority: VOLUME_PRICE_PRIORITIES.fallingShrink }));
    if (patterns.stagnant) signals.push(makeSignal('warning', 'volume_stagnation', '���۾�ʾ����������', '���ȡ�1.3���Ƿ�����1%�ҽӽ�ǰ�ߣ������λ����', { priority: VOLUME_PRICE_PRIORITIES.stagnation }));

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
    if (preBreakoutStrength) signals.push(makeSignal('hold', 'pre_breakout_strength', '���й�����ǿ��תǿ', 'MA5������������ �� ����תǿ����δͻ��20���¸ߣ��ȴ�ͻ��ȷ��', { priority: VOLUME_PRICE_PRIORITIES.preBreakoutStrength, details: { mode: 'pre_breakout_strength', breakoutLevel: indicators.previousHigh20 } }));
    if (trendBreakout) addCandidates.push(makeSignal('add', 'entry_breakout', '������ͻ�ơ���1�����֣�40%��', `ͻ��20���¸߲��ﵽ5�վ���${entryVolumeRatio.toFixed(2)}����MA5>MA10>MA20��ֹ������ͻ��K����͵�${current.low.toFixed(indicators.priceDigits)}`, { scope: 'entry', priority: ENTRY_PRIORITIES.trendBreakout, details: { mode: 'breakout', entryMode: 'breakout', allocation: '40%', stop: current.low, rank: 2 } }));
    if (pullbackConfirmed) {
      const confirmedSupport = ma5CloseHeld ? supportLevels[0] : touchedSupport || previousPullback.support || supportLevels[1];
      const pullbackAllocation = confirmedSupport.label === 'MA5' ? '25%' : confirmedSupport.label === 'MA10' ? '20%' : '15%';
      const pullbackReason = ma5CloseHeld
        ? '�����ز�MA5�����д����������̽����������վ��MA5����MA5����ȷ��'
        : supportRecovered
          ? `�����ز�${touchedSupport.label}������������֧�ţ�ֹ������תǿ`
          : 'ǰһ�������ز�MA5/MA10/MA20�����ִ����߻���û��̬����������תǿ';
      addCandidates.push(makeSignal('add', 'entry_pullback_confirmed', `�ڻز�ȷ�ϡ���2���Ӳ֣�${pullbackAllocation}��`, `${pullbackReason}���ز�${confirmedSupport.label}���ƣ��Ӳ�${pullbackAllocation}��ֹ������֧��λ${confirmedSupport.value.toFixed(indicators.priceDigits)}�·�1%-2%`, { scope: 'entry', priority: ENTRY_PRIORITIES.pullbackConfirmed, details: { mode: 'pullback', entryMode: 'pullback', allocation: pullbackAllocation, rank: 1, support: confirmedSupport.label } }));
    }
    else if (pullbackWarning) {
      const waitingSupport = ma5CloseHeldCandidate ? supportLevels[0] : touchedSupport;
      const waitAllocation = waitingSupport.label === 'MA5' ? '25%' : waitingSupport.label === 'MA10' ? '20%' : '15%';
      const waitReason = ma5CloseHeldCandidate
        ? '���������ز�MA5������վ�ϣ��ȴ�����ȷ��MA5����'
        : `��������${waitingSupport.label}�����ִ����߻���û��̬���ȴ�����תǿ`;
      addCandidates.push(makeSignal('wait_add', 'entry_pullback_wait', '�ڻز�ȷ�Ϻ�ѡ���ȴ�����תǿ', `${waitReason}���ټӲ�${waitAllocation}`, { scope: 'entry', priority: ENTRY_PRIORITIES.pullbackWaiting, confirmed: false, details: { mode: 'pullback', entryMode: 'pullback', allocation: waitAllocation, rank: 1, support: waitingSupport.label } }));
    }
    if (localBreakout) addCandidates.push(makeSignal('add', 'entry_local_breakout', 'ͻ�ƹؼ�λ����3���Ӳ֣�15%��', `�������ǲ�ͻ�ƽ�5�չؼ��ߵ�${previousHigh5.toFixed(indicators.priceDigits)}�������Ӳ��жϣ���ͷ���б��֣�ֹ������MA10 ${indicators.ma10.toFixed(indicators.priceDigits)}`, { scope: 'entry', priority: ENTRY_PRIORITIES.localBreakout, details: { mode: 'local_breakout', entryMode: 'reversal', allocation: '15%', stop: indicators.ma10, rank: 3 } }));
    if (reversal) addCandidates.push(makeSignal('add', 'entry_reversal', '�۷�ת��̬����3���Ӳ֣�15%��', `�糿�Ǻ�ͻ��20��ǰ�ߣ�������Ϊ5�վ���${entryVolumeRatio.toFixed(2)}���Ҹ���ǰ�գ�ֹ������MA10 ${indicators.ma10.toFixed(indicators.priceDigits)}`, { scope: 'entry', priority: ENTRY_PRIORITIES.reversal, details: { mode: 'reversal', entryMode: 'reversal', allocation: '15%', stop: indicators.ma10, rank: 3 } }));
    if (oversoldBase) addCandidates.push(makeSignal(sectorStable ? 'add' : 'wait_add', 'entry_oversold', '�ܳ�����������20%С�֣�', sectorStable ? '�ɼ۳������µ�˥���Ұ�����ȣ��������20%С��' : '�������µ�˥�������������������δȷ�ϣ��ݲ��Ӳ�', { scope: 'entry', priority: ENTRY_PRIORITIES.oversold, confirmed: sectorStable, details: { mode: 'oversold', entryMode: 'oversold', allocation: '��20%', rank: 4 } }));
    if (dAdd) addCandidates.push(makeSignal('d_add', 'entry_d_add', '�������֡�D���Ӳ�', '��λ��2-3��K�߲����µ��ҵ�ǰ�������������Ѽ��ֲ��ֵ�30%-50%�ز���ֹ�����ڷ����µ�', { scope: 'entry', priority: ENTRY_PRIORITIES.dAdd, details: { mode: 'd_add', entryMode: 'pullback', allocation: '�Ѽ��ֲ��ֵ�30%-50%', stop: '�����µ�' } }));

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
        candidate.reason += '�����ź�����֧��λȷ�ϻز�/�ز�������׷���ź�Ӳ����';
        candidate.details.chaseOverride = true;
        chaseOverrideUsed = true;
      }
      candidate.details.marketStatus = marketStatus;
      candidate.details.positionCap = marketPositionCap;
      if (marketStatus === 'sideways') candidate.reason += '�������𵴣��ܲ�λ���ó���60%';
      if (marketStatus === 'bear') candidate.reason += '�����̿�ͷ�����޳����������ܲ�λ���ó���20%';
      signals.push(candidate);
      addedByMarket = true;
    });
    if (chaseBlocked && !chaseOverrideUsed) signals.push(makeSignal('hold', 'no_chase', '���й�������ֹ׷��', `${chaseReasons.join('��')}�����в�λ�ɳ��У�����ֹ������λ`, { scope: 'entry', priority: 110 }));
    if (blockedByMarket.length && !addedByMarket && !riskBlocksAdding && !chaseBlocked) {
      const title = marketStatus === 'bear'
        ? '������բ����ͷ�г���ͣ�٢ڢ�'
        : marketStatus === 'sideways'
          ? '������բ��������ͣ�ܳ�������'
          : '������բ������������ͣ������λ';
      const reason = marketStatus === 'bear'
        ? 'ָ��λ��MA20�·������ܳ��������ɲ������ܲ�λ��20%'
        : marketStatus === 'sideways'
          ? '���н��٢ڢۿɲ������ܲ�λ��60%'
          : '�����������ݲ��㣬�ȴ���բ״̬ȷ�Ϻ���������λ';
      signals.push(makeSignal('warning', 'market_gate_block', title, reason, { scope: 'market', priority: 540, confirmed: marketStatus !== 'unknown', details: { marketStatus, positionCap: marketPositionCap } }));
    }

    if (signals.length === 0) signals.push(makeSignal('hold', 'default_hold', '�����ж�', 'δ�����Ӳ֡����ֻ��볡�����������ɳ��й۲�'));
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

