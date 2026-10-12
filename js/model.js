(function () {
  'use strict';
  const Baby = globalThis.Baby || (globalThis.Baby = {});
  const D = Baby.dates;
  const C = Baby.content;

  const VERSION = 1;
  const KG_MIN = 25;
  const KG_MAX = 250;
  const BAG_NAME_MAX = 30;

  const round2 = (n) => Math.round(n * 100) / 100;
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const bagGroupId = (g) => (C.BAG_GROUPS.some((x) => x.id === g) ? g : 'misc');

  /** 56.2 / "56,2" / "56.2kg" / "112斤" → 千克数；不合理的返回 null */
  function parseKg(input) {
    if (typeof input === 'number') return input >= KG_MIN && input <= KG_MAX ? round2(input) : null;
    let s = String(input ?? '').trim().replace(/[,，]/, '.');
    let factor = 1;
    if (/(kg|公斤|千克)$/i.test(s)) {
      s = s.replace(/\s*(kg|公斤|千克)$/i, '');
    } else if (/斤$/.test(s)) {
      factor = 0.5;
      s = s.replace(/\s*斤$/, '');
    }
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
    const kg = round2(Number(s) * factor);
    return kg >= KG_MIN && kg <= KG_MAX ? kg : null;
  }

  function formatKg(kg) {
    return Math.abs(kg * 10 - Math.round(kg * 10)) < 1e-6 ? kg.toFixed(1) : kg.toFixed(2);
  }

  function formatKgDiff(d) {
    if (Math.abs(d) < 0.005) return '±0';
    return (d > 0 ? '+' : '−') + formatKg(Math.abs(d));
  }

  function dueDateError(due, today) {
    if (!D.isISODate(due)) return '先选一下预产期';
    const days = D.gestation(due, today).days;
    if (days < 0) return '这个预产期离现在超过 40 周了，再确认一下？';
    if (days > 44 * 7) return '这个预产期已经过去很久了，再确认一下？';
    return null;
  }

  function createState(profile) {
    return {
      version: VERSION,
      profile: {
        dueDate: profile.dueDate,
        preWeight: profile.preWeight ?? null,
        nickname: text(profile.nickname, 12),
      },
      weights: [],
      checkups: C.defaultCheckups(),
      bag: C.defaultBag(),
      notified: {},
    };
  }

  function normalizeCheckup(c) {
    if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !c.id) return null;
    const title = text(c.title, 40);
    const days = (v) => (Number.isInteger(v) && v >= 0 && v <= 320 ? v : null);
    const target = days(c.target);
    const date = D.isISODate(c.date) ? c.date : null;
    if (!title || (target == null && !date)) return null;
    return {
      id: c.id.slice(0, 40),
      title,
      start: target == null ? null : days(c.start),
      end: target == null ? null : days(c.end),
      target,
      items: Array.isArray(c.items) ? c.items.map((s) => text(s, 80)).filter(Boolean).slice(0, 20) : [],
      tip: text(c.tip, 200),
      prep: text(c.prep, 200),
      date,
      time: /^([01]\d|2[0-3]):[0-5]\d$/.test(c.time) ? c.time : '',
      done: c.done === true,
      custom: c.custom === true,
    };
  }

  function normalizeBagItem(b) {
    if (!b || typeof b !== 'object' || typeof b.id !== 'string' || !b.id) return null;
    const name = text(b.name, BAG_NAME_MAX);
    if (!name) return null;
    return {
      id: b.id.slice(0, 40),
      group: bagGroupId(b.group),
      name,
      note: text(b.note, 60),
      done: b.done === true,
      custom: b.custom === true,
    };
  }

  /** 逐条校验，丢掉坏的和 id 重复的 */
  function normalizeList(list, normalizeOne) {
    const out = [];
    const seen = new Set();
    for (const raw of list) {
      const item = normalizeOne(raw);
      if (item && !seen.has(item.id)) {
        seen.add(item.id);
        out.push(item);
      }
    }
    return out;
  }

  /** 校验并补齐从存储或备份读出来的数据；没有有效预产期就返回 null */
  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const p = raw.profile || {};
    if (!D.isISODate(p.dueDate)) return null;

    const weights = new Map();
    for (const w of Array.isArray(raw.weights) ? raw.weights : []) {
      const kg = w ? parseKg(w.kg) : null;
      if (kg != null && D.isISODate(w.date)) weights.set(w.date, { date: w.date, kg });
    }

    // 老数据没有这两个字段时补上默认的；空数组说明是自己删光的，原样保留
    const checkups = normalizeList(Array.isArray(raw.checkups) ? raw.checkups : C.defaultCheckups(), normalizeCheckup);
    const bag = normalizeList(Array.isArray(raw.bag) ? raw.bag : C.defaultBag(), normalizeBagItem);

    const notified = {};
    if (raw.notified && typeof raw.notified === 'object') {
      for (const [k, v] of Object.entries(raw.notified)) if (D.isISODate(v)) notified[k] = v;
    }

    return {
      version: VERSION,
      profile: {
        dueDate: p.dueDate,
        preWeight: p.preWeight == null ? null : parseKg(p.preWeight),
        nickname: text(p.nickname, 12),
      },
      weights: [...weights.values()].sort(byDate),
      checkups,
      bag,
      notified,
    };
  }

  // ---- 体重 ----

  function upsertWeight(state, date, kg) {
    state.weights = state.weights.filter((w) => w.date !== date).concat({ date, kg }).sort(byDate);
  }

  function removeWeight(state, date) {
    const hit = state.weights.find((w) => w.date === date) || null;
    state.weights = state.weights.filter((w) => w.date !== date);
    return hit;
  }

  function weightSummary(state, today) {
    const ws = state.weights.filter((w) => w.date <= today);
    const latest = ws[ws.length - 1] || null;
    const previous = ws[ws.length - 2] || null;
    const pre = state.profile.preWeight;
    return {
      latest,
      previous,
      change: latest && previous ? round2(latest.kg - previous.kg) : null,
      gain: latest && pre != null ? round2(latest.kg - pre) : null,
      todayEntry: latest && latest.date === today ? latest : null,
      daysSinceLast: latest ? D.diffDays(latest.date, today) : null,
    };
  }

  // ---- 产检 ----

  /**
   * kind：done 已完成 / today 今天 / upcoming 还没到 /
   *       open 建议日期已过但孕周窗口还没关（还来得及约）/ past 已过没标完成
   */
  function checkupStatus(ck, due, today) {
    const lmp = D.lmpFromDue(due);
    const booked = Boolean(ck.date);
    const date = ck.date || D.addDays(lmp, ck.target);
    const diff = D.diffDays(today, date);
    const status = { kind: 'upcoming', date, diff, booked, ga: D.diffDays(lmp, date) };
    if (ck.done) status.kind = 'done';
    else if (diff === 0) status.kind = 'today';
    else if (diff < 0) {
      const windowEnd = !booked && ck.end != null ? D.addDays(lmp, ck.end) : null;
      if (windowEnd && windowEnd >= today) {
        status.kind = 'open';
        status.daysLeft = D.diffDays(today, windowEnd);
      } else {
        status.kind = 'past';
      }
    }
    return status;
  }

  /** 全部产检按日期（也就是孕周）排好 */
  function scheduleRows(state, today) {
    const due = state.profile.dueDate;
    return state.checkups
      .map((ck) => ({ ck, status: checkupStatus(ck, due, today) }))
      .sort((a, b) => byDate(a.status, b.status) || (a.ck.target ?? 999) - (b.ck.target ?? 999));
  }

  function nextCheckup(rows) {
    return rows.find((r) => ['today', 'open', 'upcoming'].includes(r.status.kind)) || null;
  }

  /** 页面顶部要提醒的：今天和明天的产检 */
  function reminders(rows) {
    return rows.filter((r) => !r.ck.done && (r.status.diff === 0 || r.status.diff === 1));
  }

  /** 该弹的系统通知：当天 7 点后提醒一次，前一天 18 点后提醒一次 */
  function pendingNotifications(state, today, hour) {
    const out = [];
    for (const { ck, status } of scheduleRows(state, today)) {
      if (ck.done) continue;
      let key;
      let title;
      if (status.diff === 0 && hour >= 7) {
        key = `${ck.id}@${status.date}#day`;
        title = `今天产检：${ck.title}`;
      } else if (status.diff === 1 && hour >= 18) {
        key = `${ck.id}@${status.date}#eve`;
        title = `明天产检：${ck.title}`;
      } else {
        continue;
      }
      if (state.notified[key]) continue;
      const detail = ck.prep || ck.items.slice(0, 3).join('、');
      out.push({ key, title, body: [ck.time, detail].filter(Boolean).join(' · ') });
    }
    return out;
  }

  function markNotified(state, keys, today) {
    const cutoff = D.addDays(today, -60);
    for (const [k, v] of Object.entries(state.notified)) if (v < cutoff) delete state.notified[k];
    for (const k of keys) state.notified[k] = today;
  }

  function addCheckup(state, fields) {
    const ck = {
      id: `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      title: fields.title,
      start: null,
      end: null,
      target: null,
      items: fields.items || [],
      tip: '',
      prep: fields.prep || '',
      date: fields.date,
      time: fields.time || '',
      done: false,
      custom: true,
    };
    state.checkups.push(ck);
    return ck;
  }

  function updateCheckup(state, id, patch) {
    const ck = state.checkups.find((c) => c.id === id);
    if (ck) Object.assign(ck, patch);
    return ck || null;
  }

  function removeCheckup(state, id) {
    const index = state.checkups.findIndex((c) => c.id === id);
    if (index < 0) return null;
    const [ck] = state.checkups.splice(index, 1);
    return { ck, index };
  }

  /** 模板里的产检恢复成默认（自己添加的保留） */
  function resetCheckups(state) {
    state.checkups = C.defaultCheckups().concat(state.checkups.filter((c) => c.custom));
  }

  // ---- 待产包 ----

  function bagSummary(state) {
    const done = state.bag.filter((b) => b.done).length;
    return { total: state.bag.length, done, left: state.bag.length - done };
  }

  /** 按分类分组；空分类也保留，方便往里加 */
  function bagGroups(state) {
    return C.BAG_GROUPS.map((g) => {
      const items = state.bag.filter((b) => b.group === g.id);
      return { ...g, items, done: items.filter((b) => b.done).length };
    });
  }

  /** 新物品名有问题时返回提示，没问题返回 null */
  function bagItemError(state, name) {
    if (!name) return '先写上要带什么';
    if (state.bag.some((b) => b.name === name)) return `「${name}」已经在清单里了`;
    return null;
  }

  function toggleBagItem(state, id) {
    const item = state.bag.find((b) => b.id === id);
    if (item) item.done = !item.done;
    return item || null;
  }

  function addBagItem(state, group, name) {
    const item = {
      id: `b-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      group: bagGroupId(group),
      name: text(name, BAG_NAME_MAX),
      note: '',
      done: false,
      custom: true,
    };
    state.bag.push(item);
    return item;
  }

  function removeBagItem(state, id) {
    const index = state.bag.findIndex((b) => b.id === id);
    if (index < 0) return null;
    const [item] = state.bag.splice(index, 1);
    return { item, index };
  }

  /** 默认物品恢复成没勾选，删掉的找回来（自己添加的保留原样） */
  function resetBag(state) {
    state.bag = C.defaultBag().concat(state.bag.filter((b) => b.custom));
  }

  Baby.model = {
    round2,
    parseKg,
    formatKg,
    formatKgDiff,
    dueDateError,
    createState,
    normalize,
    upsertWeight,
    removeWeight,
    weightSummary,
    checkupStatus,
    scheduleRows,
    nextCheckup,
    reminders,
    pendingNotifications,
    markNotified,
    addCheckup,
    updateCheckup,
    removeCheckup,
    resetCheckups,
    BAG_NAME_MAX,
    bagSummary,
    bagGroups,
    bagItemError,
    toggleBagItem,
    addBagItem,
    removeBagItem,
    resetBag,
  };
})();
