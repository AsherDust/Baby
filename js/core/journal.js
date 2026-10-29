(function () {
  'use strict';
  // 心情日记：每条一个心情，加上想说的话（可以不写），记在哪一天、几点。
  // 存的时候新的在前，时间线按天分组，跨月时插月份标题
  const Baby = globalThis.Baby || (globalThis.Baby = {});
  const D = Baby.dates;

  const MOODS = [
    { id: 'happy', name: '开心' },
    { id: 'calm', name: '平静' },
    { id: 'excited', name: '期待' },
    { id: 'tired', name: '累' },
    { id: 'low', name: '低落' },
    { id: 'anxious', name: '焦虑' },
  ];
  const TEXT_MAX = 2000;

  const pad2 = (n) => String(n).padStart(2, '0');
  const isMood = (m) => MOODS.some((x) => x.id === m);
  const isClock = (t) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  const clockOf = (now) => `${pad2(new Date(now).getHours())}:${pad2(new Date(now).getMinutes())}`;
  const newId = () => `j-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const newest = (a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.time < b.time ? 1 : a.time > b.time ? -1 : 0);

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
    if (!isMood(f.mood)) return '先选一个心情吧';
    if (!D.isISODate(f.date)) return '选一下日期';
    if (f.date > today) return '日期不能晚于今天';
    if (tidy(f.text).length > TEXT_MAX) return `写得太长啦，最多 ${TEXT_MAX} 字`;
    return null;
  }

  /** 记在今天的带上几点；补记以前的日子不知道几点，就空着 */
  function add(state, f, today, now) {
    const entry = { id: newId(), ...fields(f), time: f.date === today ? clockOf(now) : '' };
    state.journal.push(entry);
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

  Baby.journal = { MOODS, TEXT_MAX, CARE_DAYS, CARE_MIN, moodOf, normalize, entryError, add, update, remove, onDay, timeline, careCheck };
})();
