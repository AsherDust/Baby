(function () {
  'use strict';
  const Baby = globalThis.Baby || (globalThis.Baby = {});

  // 日期一律用 'YYYY-MM-DD' 字符串，换算成 UTC 天序号做加减，不受时区和夏令时影响。
  const DAY_MS = 86400000;
  const PREGNANCY_DAYS = 280;
  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
  const SUPERSCRIPT = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶'];

  const pad = (n) => String(n).padStart(2, '0');

  function isISODate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  function toDayNumber(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
  }

  function fromDayNumber(n) {
    const dt = new Date(n * DAY_MS);
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  }

  function localISO(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  // 地址栏加 ?today=2026-10-15 可以预览某一天的样子。
  function todayOverride() {
    try {
      const v = new URLSearchParams(globalThis.location.search).get('today');
      return isISODate(v) ? v : null;
    } catch (e) {
      return null;
    }
  }

  function today() {
    return todayOverride() || localISO(new Date());
  }

  function addDays(iso, n) {
    return fromDayNumber(toDayNumber(iso) + n);
  }

  /** b 比 a 晚几天（b 在前则为负数） */
  function diffDays(a, b) {
    return toDayNumber(b) - toDayNumber(a);
  }

  function lmpFromDue(due) {
    return addDays(due, -PREGNANCY_DAYS);
  }

  function dueFromLmp(lmp) {
    return addDays(lmp, PREGNANCY_DAYS);
  }

  /** 某天的孕龄：days 为从末次月经算起的天数 */
  function gestation(due, on) {
    const days = diffDays(lmpFromDue(due), on);
    return { days, weeks: Math.floor(days / 7), day: ((days % 7) + 7) % 7 };
  }

  function dateAtGestation(due, days) {
    return addDays(lmpFromDue(due), days);
  }

  /** 1 孕早期（<14 周），2 孕中期（14–27⁺⁶ 周），3 孕晚期（≥28 周） */
  function trimester(days) {
    if (days < 98) return 1;
    if (days < 196) return 2;
    return 3;
  }

  const TRIMESTER_NAMES = { 1: '孕早期', 2: '孕中期', 3: '孕晚期' };

  /** 24⁺³ 这样的紧凑写法，整周时只写周数 */
  function formatGA(days) {
    const w = Math.floor(days / 7);
    const d = days - w * 7;
    return d ? `${w}⁺${SUPERSCRIPT[d]}` : `${w}`;
  }

  function formatWindow(start, end) {
    const sw = Math.floor(start / 7);
    const ew = Math.floor(end / 7);
    if (sw === ew && start % 7 === 0 && end % 7 === 6) return `${sw} 周`;
    return `${formatGA(start)}–${formatGA(end)} 周`;
  }

  function weekday(iso) {
    return WEEKDAYS[new Date(toDayNumber(iso) * DAY_MS).getUTCDay()];
  }

  /**
   * 10月15日；opts.weekday 追加"周四"；跨年或 opts.year 时带年份。
   */
  function formatDate(iso, opts = {}) {
    const [y, m, d] = iso.split('-').map(Number);
    const showYear = opts.year || (opts.relativeTo && Number(opts.relativeTo.slice(0, 4)) !== y);
    let s = `${showYear ? `${y}年` : ''}${m}月${d}日`;
    if (opts.weekday) s += ` 周${weekday(iso)}`;
    return s;
  }

  function formatRelative(n) {
    if (n === 0) return '今天';
    if (n === 1) return '明天';
    if (n === 2) return '后天';
    if (n === -1) return '昨天';
    if (n === -2) return '前天';
    return n > 0 ? `${n} 天后` : `${-n} 天前`;
  }

  Baby.dates = {
    PREGNANCY_DAYS,
    TRIMESTER_NAMES,
    isISODate,
    localISO,
    today,
    addDays,
    diffDays,
    lmpFromDue,
    dueFromLmp,
    gestation,
    dateAtGestation,
    trimester,
    formatGA,
    formatWindow,
    weekday,
    formatDate,
    formatRelative,
  };
})();
