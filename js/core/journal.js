(function () {
  'use strict';
  // 心情日记：每条一个心情，加上想说的话（可以不写），记在哪一天、几点。
  // 存的时候新的在前，时间线按天分组，跨月时插月份标题
  const Baby = globalThis.Baby || (globalThis.Baby = {});
  const D = Baby.dates;
  const U = Baby.util;
  const { msg } = Baby.i18n;

  const MOODS = [
    { id: 'happy', name: '开心' },
    { id: 'calm', name: '平静' },
    { id: 'excited', name: '期待' },
    { id: 'tired', name: '累累' },
    { id: 'low', name: '低落' },
    { id: 'anxious', name: '焦虑' },
  ];
  const TEXT_MAX = 2000;

  const { pad: pad2, isClock } = U;
  const isMood = (m) => MOODS.some((x) => x.id === m);
  const clockOf = (now) => `${pad2(new Date(now).getHours())}:${pad2(new Date(now).getMinutes())}`;
  const newId = () => U.newId('j');
  // 蜜罐生成的编号带创建毫秒和四位随机后缀，旧记录也能区分同一分钟的先后。
  function createdAt(id) {
    const match = /^j-([a-z0-9]+)[a-z0-9]{4}$/.exec(id);
    return match ? parseInt(match[1], 36) : 0;
  }

  function newest(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.time !== b.time) return a.time < b.time ? 1 : -1;
    return createdAt(b.id) - createdAt(a.id);
  }

  /** 统一换行，连着的空行只留一个 */
  function tidy(v) {
    if (typeof v !== 'string') return '';
    return v.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  const cleanText = (v) => tidy(v).slice(0, TEXT_MAX);

  const fields = (f) => ({ date: f.date, mood: f.mood, text: cleanText(f.text) });
  const moodOf = (id) => MOODS.find((m) => m.id === id) || null;

  function normalizeEntry(e) {
    if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !e.id) return null;
    if (!D.isISODate(e.date) || !isMood(e.mood)) return null;
    return { id: e.id.slice(0, 40), date: e.date, time: isClock(e.time) ? e.time : '', mood: e.mood, text: cleanText(e.text) };
  }

  /** 校验从存储或备份读出来的：丢掉坏的和 id 重复的，新的排前面 */
  function normalize(raw) {
    const out = [];
    const seen = new Set();
    for (const item of Array.isArray(raw) ? raw : []) {
      const e = normalizeEntry(item);
      if (e && !seen.has(e.id)) {
        seen.add(e.id);
        out.push(e);
      }
    }
    return out.sort(newest);
  }

  function entryError(f, today) {
    if (!isMood(f.mood)) return msg('mood.missing');
    if (!D.isISODate(f.date)) return msg('form.pickDate');
    if (f.date > today) return msg('form.notFuture');
    if (tidy(f.text).length > TEXT_MAX) return msg('mood.tooLong', { max: TEXT_MAX });
    return null;
  }

  /** 记在今天的带上几点；补记以前的日子不知道几点，就空着 */
  function add(state, f, today, now) {
    const entry = { id: newId(), ...fields(f), time: f.date === today ? clockOf(now) : '' };
    state.journal.unshift(entry);
    state.journal.sort(newest);
    return entry;
  }

  function update(state, id, f) {
    const entry = state.journal.find((e) => e.id === id);
    if (!entry) return null;
    Object.assign(entry, fields(f));
    state.journal.sort(newest);
    return entry;
  }

  function remove(state, id) {
    const index = state.journal.findIndex((e) => e.id === id);
    if (index < 0) return null;
    const [entry] = state.journal.splice(index, 1);
    Baby.merge.drop(state.removed, `journal:${id}`, entry);
    return { entry, index };
  }

  const onDay = (list, date) => list.filter((e) => e.date === date);

  /**
   * 时间线：只取前 limit 条，按天分组，每天带上孕龄；
   * months 是每个月一共几条（包括没显示出来的），more 是还剩几条没显示
   */
  function timeline(list, dueDate, limit = Infinity) {
    const shown = list.slice(0, limit);
    const days = [];
    for (const e of shown) {
      let day = days[days.length - 1];
      if (!day || day.date !== e.date) {
        day = { date: e.date, month: e.date.slice(0, 7), ga: D.gestation(dueDate, e.date).days, entries: [] };
        days.push(day);
      }
      day.entries.push(e);
    }
    const months = {};
    for (const e of list) months[e.date.slice(0, 7)] = (months[e.date.slice(0, 7)] || 0) + 1;
    return { days, months, more: list.length - shown.length };
  }

  /** 那天在哪个阶段：pre 孕前、early 孕早期、mid 孕中期、late 孕晚期、post 宝宝出生以后 */
  function stageOn(date, dueDate, birthDate) {
    if (birthDate && date >= birthDate) return 'post';
    const ga = D.gestation(dueDate, date).days;
    return ga < 0 ? 'pre' : ['early', 'mid', 'late'][D.trimester(ga) - 1];
  }

  /** 2026-11 往前往后翻 n 个月 */
  function shiftMonth(month, n) {
    const [y, m] = month.split('-').map(Number);
    const i = y * 12 + (m - 1) + n;
    return `${Math.floor(i / 12)}-${pad2((i % 12) + 1)}`;
  }

  /**
   * 月历：一周从周一开始，月初前面空出来的格子是 null；
   * 每格是 { date, day, stage, latest（这天最新的一条）, count, isToday, future }，days 是这个月记了几天
   */
  function calendar(list, month, { dueDate, birthDate, today }) {
    const [y, m] = month.split('-').map(Number);
    const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
    const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const byDate = new Map();
    for (const e of list) {
      if (e.date.slice(0, 7) !== month) continue;
      const day = byDate.get(e.date);
      if (day) day.count += 1;
      else byDate.set(e.date, { latest: e, count: 1 });
    }
    const cells = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= total; d += 1) {
      const date = `${month}-${pad2(d)}`;
      const got = byDate.get(date);
      cells.push({
        date, day: d, stage: stageOn(date, dueDate, birthDate),
        latest: got ? got.latest : null, count: got ? got.count : 0, isToday: date === today, future: date > today,
      });
    }
    return { month, cells, days: byDate.size };
  }

  /** 连着记了几天：今天记了从今天往前数，今天还没记从昨天往前数 */
  function streak(list, today) {
    const dates = new Set(list.map((e) => e.date));
    let day = dates.has(today) ? today : D.addDays(today, -1);
    let days = 0;
    while (dates.has(day)) {
      days += 1;
      day = D.addDays(day, -1);
    }
    return { days, today: dates.has(today) };
  }

  // 低落、焦虑算心情不太好；最近 14 天里有 5 天以上这样，温和地关心一下
  const HEAVY = ['low', 'anxious'];
  const CARE_DAYS = 14;
  const CARE_MIN = 5;

  /** 最近 14 天（含今天）里有几天记了低落或焦虑，同一天记好几条只算一天 */
  function careCheck(list, today) {
    const from = D.addDays(today, -(CARE_DAYS - 1));
    const days = new Set(list.filter((e) => e.date >= from && e.date <= today && HEAVY.includes(e.mood)).map((e) => e.date));
    return { days: days.size, show: days.size >= CARE_MIN };
  }

  Baby.journal = {
    MOODS, TEXT_MAX, CARE_DAYS, CARE_MIN, moodOf, normalize, entryError, add, update, remove, onDay, timeline,
    stageOn, shiftMonth, calendar, streak, careCheck,
  };
})();
