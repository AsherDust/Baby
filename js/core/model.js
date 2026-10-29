(function () {
  'use strict';
  const Baby = globalThis.Baby || (globalThis.Baby = {});
  const D = Baby.dates;
  const C = Baby.content;
  const St = Baby.stories;
  const J = Baby.journal;
  const R = Baby.recipes;
  const B = Baby.baby;
  const Mg = Baby.merge;

  const VERSION = 1;
  const KG_MIN = 25;
  const KG_MAX = 250;
  const CM_MIN = 100;
  const CM_MAX = 220;
  // 体重增长推荐值标准不适用于身高低于 140 cm、孕前体重高于 125 kg 的人
  const GAIN_CM_MIN = 140;
  const GAIN_KG_MAX = 125;
  const BAG_NAME_MAX = 30;
  const MED_NAME_MAX = 30;

  // 用药回顾按这几个阶段看；from/to 是孕龄天数，左闭右开
  const MED_STAGES = [
    { id: 'pre', name: '孕前', from: -Infinity, to: 0 },
    { id: 't1', name: D.TRIMESTER_NAMES[1], from: 0, to: 98 },
    { id: 't2', name: D.TRIMESTER_NAMES[2], from: 98, to: 196 },
    { id: 't3', name: D.TRIMESTER_NAMES[3], from: 196, to: Infinity },
  ];

  // 数胎动：一次数 1 小时，5 分钟内连续的胎动算 1 次
  const KICK_WINDOW = 60 * 60000;
  const KICK_MERGE = 5 * 60000;
  const KICK_NORMAL = 3;
  const KICK_KEEP = 120;
  // 宫缩计时只留最近 7 天；单次超过 5 分钟多半是忘了点结束，不算进统计
  const CONTRACTION_KEEP = 7 * 86400000;
  const CONTRACTION_LONG = 5 * 60000;

  // 血压：孕期 ≥140/90 算高，≥160/110 算严重
  const BP_RANGE = { sys: [60, 250], dia: [30, 150], pulse: [30, 220] };
  // 血糖（mmol/L）：低于 3.3 偏低；餐后按 1 小时还是 2 小时测，目标不一样
  const GLUCOSE_RANGE = [1, 33.3];
  const GLUCOSE_LOW = 3.3;

  // 盆底肌练习：一组是慢收缩 10 次（收紧 hold 秒、放松一样久）、歇 3 秒，再快收缩 10 次（收紧 1 秒、放松 2 秒）；
  // 每天 3 组，练了几组只留最近 60 天
  const PELVIC_HOLDS = [3, 5, 8, 10];
  const PELVIC_REPS = 10;
  const PELVIC_GOAL = 3;
  const PELVIC_KEEP = 60;

  const round2 = (n) => Math.round(n * 100) / 100;
  const isClock = (t) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const isTime = (v) => Number.isFinite(v) && v > 0;
  const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const byStart = (a, b) => a.start - b.start;
  const byDateTime = (a, b) => byDate(a, b) || (a.time < b.time ? -1 : a.time > b.time ? 1 : 0);
  const slotIndex = (slot) => C.GLUCOSE_SLOTS.findIndex((s) => s.id === slot);
  const byDateSlot = (a, b) => byDate(a, b) || slotIndex(a.slot) - slotIndex(b.slot);
  const toNumber = (v) => (typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(/[,，]/, '.')));
  const isBlank = (v) => v == null || String(v).trim() === '';

  function intIn(v, [lo, hi]) {
    if (isBlank(v)) return null;
    const n = toNumber(v);
    return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
  }
  const mean = (list) => list.reduce((s, n) => s + n, 0) / list.length;
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

  /** 160 / "160cm" / "1.6" / "1.65米" → 厘米数；不合理的返回 null */
  function parseHeight(input) {
    if (typeof input === 'number') return input >= CM_MIN && input <= CM_MAX ? Math.round(input * 10) / 10 : null;
    let s = String(input ?? '').trim().replace(/[,，]/, '.').replace(/\s*(cm|厘米|公分)$/i, '');
    let factor = 1;
    if (/(m|米)$/i.test(s)) {
      s = s.replace(/\s*(m|米)$/i, '');
      factor = 100;
    }
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
    let cm = Number(s) * factor;
    if (cm < 3) cm *= 100;
    cm = Math.round(cm * 10) / 10;
    return cm >= CM_MIN && cm <= CM_MAX ? cm : null;
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

  function createState(profile, today = null) {
    return {
      version: VERSION,
      profile: {
        dueDate: profile.dueDate,
        preWeight: profile.preWeight ?? null,
        height: profile.height ?? null,
        nickname: text(profile.nickname, 12),
      },
      prefs: { glucoseAfter: 2, since: D.isISODate(today) ? today : null, lastBackup: null, backupNudged: null, installHintHidden: false, storyCardHidden: null, moodCareHidden: null },
      weights: [],
      checkups: C.defaultCheckups(),
      bag: C.defaultBag(),
      meds: [],
      kicks: [],
      contractions: [],
      bp: [],
      glucose: [],
      ultrasounds: [],
      stories: St.empty(),
      journal: [],
      meals: R.empty(),
      pelvic: { hold: 5, days: {} },
      baby: null,
      removed: {},
      edits: {},
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

  /** 用药记录里允许保存的字段，顺便截掉过长的文字 */
  function medFields(f) {
    return {
      name: text(f.name, MED_NAME_MAX),
      kind: f.kind === 'medicine' ? 'medicine' : 'supplement',
      dose: text(f.dose, 40),
      start: f.start,
      end: f.end || null,
      note: text(f.note, 120),
    };
  }

  function normalizeMed(m) {
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !m.id) return null;
    const fields = medFields(m);
    if (!fields.name || !D.isISODate(fields.start)) return null;
    if (!D.isISODate(fields.end) || fields.end < fields.start) fields.end = null;
    return { id: m.id.slice(0, 40), ...fields };
  }

  function normalizeKick(k) {
    if (!k || typeof k !== 'object' || typeof k.id !== 'string' || !k.id || !isTime(k.start)) return null;
    const limit = k.start + KICK_WINDOW;
    const end = isTime(k.end) && k.end >= k.start ? Math.min(k.end, limit) : null;
    const taps = (Array.isArray(k.taps) ? k.taps : [])
      .filter((t) => isTime(t) && t >= k.start && t <= (end ?? limit))
      .sort((a, b) => a - b)
      .slice(0, 500);
    return { id: k.id.slice(0, 40), start: k.start, end, taps };
  }

  function normalizeContraction(c) {
    if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !c.id || !isTime(c.start)) return null;
    return { id: c.id.slice(0, 40), start: c.start, end: isTime(c.end) && c.end >= c.start ? c.end : null };
  }

  function bpFields(f) {
    return {
      date: f.date,
      time: isClock(f.time) ? f.time : '',
      sys: intIn(f.sys, BP_RANGE.sys),
      dia: intIn(f.dia, BP_RANGE.dia),
      pulse: intIn(f.pulse, BP_RANGE.pulse),
      note: text(f.note, 60),
    };
  }

  function normalizeBp(b) {
    if (!b || typeof b !== 'object' || typeof b.id !== 'string' || !b.id) return null;
    const fields = bpFields(b);
    if (!D.isISODate(fields.date) || fields.sys == null || fields.dia == null || fields.sys <= fields.dia) return null;
    return { id: b.id.slice(0, 40), ...fields };
  }

  function parseGlucose(v) {
    const s = String(v ?? '').trim().replace(/[,，]/, '.');
    if (!/^\d{1,2}(\.\d{1,2})?$/.test(s)) return null;
    const n = Math.round(Number(s) * 10) / 10;
    return n >= GLUCOSE_RANGE[0] && n <= GLUCOSE_RANGE[1] ? n : null;
  }

  function normalizeGlucose(g) {
    if (!g || typeof g !== 'object' || !D.isISODate(g.date) || slotIndex(g.slot) < 0) return null;
    const value = parseGlucose(g.value);
    return value == null ? null : { date: g.date, slot: g.slot, value };
  }

  /** B 超数值：空的跳过，超出范围的丢掉，按各项精度取整 */
  function usValues(raw) {
    const values = {};
    for (const f of C.US_FIELDS) {
      const v = raw ? raw[f.id] : null;
      if (isBlank(v)) continue;
      const n = toNumber(v);
      if (Number.isFinite(n) && n >= f.min && n <= f.max) values[f.id] = f.step >= 1 ? Math.round(n) : Math.round(n * 10) / 10;
    }
    return values;
  }

  function usFields(f) {
    return { date: f.date, values: usValues(f.values), placenta: text(f.placenta, 40), note: text(f.note, 200) };
  }

  function normalizeUltrasound(u) {
    if (!u || typeof u !== 'object' || typeof u.id !== 'string' || !u.id) return null;
    const fields = usFields(u);
    if (!D.isISODate(fields.date) || (!Object.keys(fields.values).length && !fields.placenta && !fields.note)) return null;
    return { id: u.id.slice(0, 40), ...fields };
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

  function normalizePelvic(raw) {
    const p = raw && typeof raw === 'object' ? raw : {};
    const days = {};
    const dated = Object.entries(p.days && typeof p.days === 'object' ? p.days : {})
      .filter(([d, n]) => D.isISODate(d) && Number.isInteger(n) && n > 0 && n <= 50).sort(([a], [b]) => (a < b ? -1 : 1));
    for (const [d, n] of dated.slice(-PELVIC_KEEP)) days[d] = n;
    return { hold: PELVIC_HOLDS.includes(p.hold) ? p.hold : 5, days };
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
    const meds = normalizeList(Array.isArray(raw.meds) ? raw.meds : [], normalizeMed);
    const kicks = normalizeList(Array.isArray(raw.kicks) ? raw.kicks : [], normalizeKick).sort(byStart).slice(-KICK_KEEP);
    const contractions = normalizeList(Array.isArray(raw.contractions) ? raw.contractions : [], normalizeContraction).sort(byStart);
    const bp = normalizeList(Array.isArray(raw.bp) ? raw.bp : [], normalizeBp).sort(byDateTime);
    const ultrasounds = normalizeList(Array.isArray(raw.ultrasounds) ? raw.ultrasounds : [], normalizeUltrasound).sort(byDate);
    const glucose = new Map();
    for (const g of Array.isArray(raw.glucose) ? raw.glucose : []) {
      const item = normalizeGlucose(g);
      if (item) glucose.set(`${item.date}/${item.slot}`, item);
    }
    const prefs = raw.prefs && typeof raw.prefs === 'object' ? raw.prefs : {};

    const notified = {};
    if (raw.notified && typeof raw.notified === 'object') {
      for (const [k, v] of Object.entries(raw.notified)) if (D.isISODate(v)) notified[k] = v;
    }

    return {
      version: VERSION,
      profile: {
        dueDate: p.dueDate,
        preWeight: p.preWeight == null ? null : parseKg(p.preWeight),
        height: p.height == null ? null : parseHeight(p.height),
        nickname: text(p.nickname, 12),
      },
      prefs: {
        glucoseAfter: prefs.glucoseAfter === 1 ? 1 : 2,
        since: D.isISODate(prefs.since) ? prefs.since : null,
        lastBackup: D.isISODate(prefs.lastBackup) ? prefs.lastBackup : null,
        backupNudged: D.isISODate(prefs.backupNudged) ? prefs.backupNudged : null,
        installHintHidden: prefs.installHintHidden === true,
        storyCardHidden: D.isISODate(prefs.storyCardHidden) ? prefs.storyCardHidden : null,
        moodCareHidden: D.isISODate(prefs.moodCareHidden) ? prefs.moodCareHidden : null,
      },
      weights: [...weights.values()].sort(byDate),
      checkups,
      bag,
      meds,
      kicks,
      contractions,
      bp,
      glucose: [...glucose.values()].sort(byDateSlot),
      ultrasounds,
      stories: St.normalize(raw.stories),
      journal: J.normalize(raw.journal),
      meals: R.normalize(raw.meals),
      pelvic: normalizePelvic(raw.pelvic),
      baby: B.normalize(raw.baby),
      removed: Mg.clean(raw.removed),
      edits: Mg.cleanEdits(raw.edits),
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
    if (hit) Mg.drop(state.removed, `weight:${date}`, hit);
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

  /**
   * 按孕前 BMI 该长多少：没填孕前体重或身高是 null；标准不适用时 { applies: false }；
   * 否则 { applies: true, bmi, id, name, total, weekly }
   */
  function gainPlan(profile) {
    const { preWeight: kg, height: cm } = profile;
    if (kg == null || cm == null) return null;
    if (cm < GAIN_CM_MIN || kg > GAIN_KG_MAX) return { applies: false };
    const bmi = Math.round((kg / (cm / 100) ** 2) * 10) / 10;
    return { applies: true, bmi, ...C.WEIGHT_GAIN.find((g) => bmi < g.below) };
  }

  /**
   * 孕龄这天累计长多少算在范围里 [下限, 上限]（千克）：孕早期 0～2 kg，
   * 14 周起两头各自匀速长到 40 周时的总范围，之后不再变
   */
  function gainRange(plan, days) {
    const [e0, e1] = C.EARLY_GAIN;
    const t = Math.min(1, Math.max(0, (days / 7 - 14) / 26));
    return [round2(e0 + (plan.total[0] - e0) * t), round2(e1 + (plan.total[1] - e1) * t)];
  }

  /** 最近一次体重和推荐范围比：{ plan, gain, range, level: low / ok / high, weeks }；算不了或宝宝已经出生是 null */
  function gainStatus(state, today) {
    if (state.baby) return null;
    const plan = gainPlan(state.profile);
    const latest = weightSummary(state, today).latest;
    if (!plan || !plan.applies || !latest) return null;
    const days = D.gestation(state.profile.dueDate, latest.date).days;
    if (days < 0) return null;
    const gain = round2(latest.kg - state.profile.preWeight);
    const range = gainRange(plan, days);
    const level = gain > range[1] ? 'high' : gain < range[0] ? 'low' : 'ok';
    return { plan, gain, range, level, weeks: Math.floor(days / 7) };
  }

  // ---- 盆底肌练习 ----

  /** 一组里的每一步（秒）：{ part: slow / quick / rest, phase: squeeze / relax / rest, rep, from, to } */
  function pelvicSteps(hold) {
    const steps = [];
    let t = 0;
    const add = (part, phase, rep, len) => { steps.push({ part, phase, rep, from: t, to: t + len }); t += len; };
    for (let i = 1; i <= PELVIC_REPS; i += 1) {
      add('slow', 'squeeze', i, hold);
      add('slow', 'relax', i, hold);
    }
    add('rest', 'rest', 0, 3);
    for (let i = 1; i <= PELVIC_REPS; i += 1) {
      add('quick', 'squeeze', i, 1);
      add('quick', 'relax', i, 2);
    }
    return steps;
  }

  /** 开始后过了 elapsed 秒练到哪了：{ index, step, left 这一步还剩几秒, done } */
  function pelvicAt(hold, elapsed) {
    const steps = pelvicSteps(hold);
    const index = steps.findIndex((s) => elapsed < s.to);
    if (index < 0) return { index: steps.length, step: null, left: 0, done: true };
    return { index, step: steps[index], left: Math.ceil(steps[index].to - elapsed), done: false };
  }

  /** 练完一组记一下；顺手只留最近 60 天 */
  function addPelvicSet(state, today) {
    state.pelvic.days[today] = (state.pelvic.days[today] || 0) + 1;
    state.pelvic = normalizePelvic(state.pelvic);
    return state.pelvic.days[today];
  }

  /** 最近 7 天每天练了几组，最后一天是今天 */
  function pelvicWeek(state, today) {
    return Array.from({ length: 7 }, (_, i) => {
      const date = D.addDays(today, i - 6);
      return { date, sets: state.pelvic.days[date] || 0 };
    });
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
    Mg.drop(state.removed, `checkup:${id}`, ck);
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
    Mg.drop(state.removed, `bag:${id}`, item);
    return { item, index };
  }

  /** 默认物品恢复成没勾选，删掉的找回来（自己添加的保留原样） */
  function resetBag(state) {
    state.bag = C.defaultBag().concat(state.bag.filter((b) => b.custom));
  }

  // ---- 用药与补剂 ----

  /** 表单内容有问题时返回提示，没问题返回 null */
  function medError(f, today) {
    if (!text(f.name, MED_NAME_MAX)) return '写一下药或补剂的名字';
    if (!D.isISODate(f.start)) return '选一下开始日期';
    if (f.start > today) return '开始日期不能晚于今天';
    if (f.end && !D.isISODate(f.end)) return '结束日期格式不对，重新选一下';
    if (f.end && f.end < f.start) return '结束日期不能早于开始日期';
    return null;
  }

  function addMed(state, f) {
    const med = { id: `m-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...medFields(f) };
    state.meds.push(med);
    return med;
  }

  function updateMed(state, id, f) {
    const med = state.meds.find((m) => m.id === id);
    if (med) Object.assign(med, medFields(f));
    return med || null;
  }

  function removeMed(state, id) {
    const index = state.meds.findIndex((m) => m.id === id);
    if (index < 0) return null;
    const [med] = state.meds.splice(index, 1);
    Mg.drop(state.removed, `med:${id}`, med);
    return { med, index };
  }

  /** 记为今天停了；返回原来的结束日期，方便撤销 */
  function stopMed(state, id, today) {
    const med = state.meds.find((m) => m.id === id);
    if (!med) return null;
    const previous = med.end;
    med.end = today < med.start ? med.start : today;
    return { med, previous };
  }

  /**
   * 用药记录按开始日期排好，附上孕龄范围（天数）和吃过的阶段。
   * untilGA 是实际吃到的那天：还在吃的算到今天，计划以后才停的也只算到今天。
   */
  function medRows(state, today) {
    const lmp = D.lmpFromDue(state.profile.dueDate);
    return state.meds
      .map((med) => {
        const ongoing = !med.end || med.end > today;
        let until = ongoing ? today : med.end;
        if (until < med.start) until = med.start;
        const startGA = D.diffDays(lmp, med.start);
        const untilGA = D.diffDays(lmp, until);
        return {
          med,
          ongoing,
          startGA,
          untilGA,
          endGA: med.end ? D.diffDays(lmp, med.end) : null,
          days: D.diffDays(med.start, until) + 1,
          stages: MED_STAGES.filter((s) => startGA < s.to && untilGA >= s.from).map((s) => s.id),
        };
      })
      .sort((a, b) => a.startGA - b.startGA);
  }

  /** 时间轴范围（孕龄天数）：往前最多画到孕前 16 周，往后至少画到 40 周、最多 44 周 */
  function medTimeline(rows, todayGA) {
    return {
      from: Math.max(-16 * 7, Math.min(0, ...rows.map((r) => r.startGA))),
      to: Math.min(44 * 7, Math.max(D.PREGNANCY_DAYS, todayGA, ...rows.map((r) => r.endGA ?? r.untilGA))),
    };
  }

  // ---- 数胎动 ----

  /** 算进去的那几下：从一下算起，之后 5 分钟内再点都并进这一次 */
  function countedKicks(taps) {
    const out = [];
    for (const t of taps) if (!out.length || t - out[out.length - 1] >= KICK_MERGE) out.push(t);
    return out;
  }

  function activeKicks(state, now) {
    const k = state.kicks[state.kicks.length - 1];
    return k && k.end == null && now < k.start + KICK_WINDOW ? k : null;
  }

  /** 满 1 小时还没点结束的补上结束时间，返回补上的那次 */
  function settleKicks(state, now) {
    const k = state.kicks[state.kicks.length - 1];
    if (!k || k.end != null || now < k.start + KICK_WINDOW) return null;
    k.end = k.start + KICK_WINDOW;
    return k;
  }

  function startKicks(state, now) {
    settleKicks(state, now);
    const running = activeKicks(state, now);
    if (running) return running;
    const k = { id: newId('k'), start: now, end: null, taps: [] };
    state.kicks.push(k);
    if (state.kicks.length > KICK_KEEP) state.kicks.splice(0, state.kicks.length - KICK_KEEP);
    return k;
  }

  /** 点一下「动了」；counted 表示这下算成了新的一次 */
  function tapKick(state, now) {
    const k = activeKicks(state, now);
    if (!k) return null;
    const before = countedKicks(k.taps).length;
    k.taps.push(now);
    return { session: k, counted: countedKicks(k.taps).length > before };
  }

  function endKicks(state, now) {
    const k = activeKicks(state, now);
    if (k) k.end = now;
    return k;
  }

  function removeKicks(state, id) {
    const index = state.kicks.findIndex((k) => k.id === id);
    if (index < 0) return null;
    const [session] = state.kicks.splice(index, 1);
    Mg.drop(state.removed, `kick:${id}`, session);
    return { session, index };
  }

  /**
   * 每次数胎动的结果，新的在前。verdict：ok 正常 / low 数满 1 小时不到 3 次 /
   * drop 比最近几次的平均少了一半以上 / short 没数满且不到 3 次；还在数的是 null
   */
  function kickReview(state, now) {
    const fullCounts = [];
    const rows = state.kicks.map((k) => {
      const end = k.end ?? Math.min(now, k.start + KICK_WINDOW);
      const count = countedKicks(k.taps).length;
      const running = k.end == null && now < k.start + KICK_WINDOW;
      const full = end - k.start >= KICK_WINDOW - 60000;
      const recent = fullCounts.slice(-7);
      const baseline = recent.length >= 3 ? Math.round(mean(recent) * 10) / 10 : null;
      let verdict = null;
      if (!running) {
        if (full && count < KICK_NORMAL) verdict = 'low';
        else if (full && baseline != null && count < baseline / 2) verdict = 'drop';
        else if (count >= KICK_NORMAL) verdict = 'ok';
        else verdict = 'short';
        if (full) fullCounts.push(count);
      }
      return {
        session: k,
        date: D.localISO(new Date(k.start)),
        running,
        count,
        taps: k.taps.length,
        minutes: Math.floor((end - k.start) / 60000),
        full,
        baseline,
        verdict,
      };
    });
    return rows.reverse();
  }

  // ---- 宫缩计时 ----

  function activeContraction(state) {
    const c = state.contractions[state.contractions.length - 1];
    return c && c.end == null ? c : null;
  }

  // 两次宫缩之间隔着不到这么久，算还在计时
  const AWAKE_BETWEEN = 20 * 60000;

  /** 正在数胎动、或者正在宫缩计时页上计时（含两次之间的空档）时，屏幕最好别自动锁上 */
  function keepScreenOn(state, now, onContractionPage) {
    if (activeKicks(state, now) || activeContraction(state)) return true;
    const last = state.contractions[state.contractions.length - 1];
    return Boolean(onContractionPage && last && now - last.start < AWAKE_BETWEEN);
  }

  /** 宫缩开始点一下、结束再点一下；开始新的一次时顺手清掉 7 天前的记录 */
  function toggleContraction(state, now) {
    const running = activeContraction(state);
    if (running) {
      running.end = Math.max(now, running.start);
      return { contraction: running, started: false };
    }
    state.contractions = state.contractions.filter((c) => c.start >= now - CONTRACTION_KEEP);
    const c = { id: newId('q'), start: now, end: null };
    state.contractions.push(c);
    return { contraction: c, started: true };
  }

  function removeContraction(state, id) {
    const index = state.contractions.findIndex((c) => c.id === id);
    if (index < 0) return null;
    const [contraction] = state.contractions.splice(index, 1);
    Mg.drop(state.removed, `contraction:${id}`, contraction);
    return { contraction, index };
  }

  /** 最近 since 毫秒内的宫缩，新的在前；interval 是和上一次开始隔了多久 */
  function contractionRows(state, now, since = 12 * 3600000) {
    const list = state.contractions;
    return list
      .map((c, i) => ({ contraction: c, duration: c.end == null ? null : c.end - c.start, interval: i ? c.start - list[i - 1].start : null }))
      .filter((r) => r.contraction.start >= now - since)
      .reverse();
  }

  /**
   * 看最近 1 小时的规律。level：go 接近 5-1-1（约 5 分钟一次、每次约 1 分钟、持续了快 1 小时）/
   * watch 比较规律（10 分钟以内一次）/ early 还不规律 / none 次数太少
   */
  function contractionStats(state, now) {
    const recent = state.contractions.filter((c) => c.end != null && c.start >= now - 60 * 60000 && c.end - c.start <= CONTRACTION_LONG);
    const stats = { count: recent.length, avgDuration: null, avgInterval: null, level: 'none' };
    if (recent.length < 2) return stats;
    const span = recent[recent.length - 1].start - recent[0].start;
    stats.avgDuration = Math.round(mean(recent.map((c) => c.end - c.start)) / 1000);
    stats.avgInterval = Math.round(mean(recent.slice(1).map((c, i) => c.start - recent[i].start)) / 6000) / 10;
    if (span >= 45 * 60000 && stats.avgInterval <= 5.5 && stats.avgDuration >= 45) stats.level = 'go';
    else if (recent.length >= 3 && stats.avgInterval <= 10) stats.level = 'watch';
    else stats.level = 'early';
    return stats;
  }

  // ---- 血压 ----

  function bpError(f, today) {
    if (!D.isISODate(f.date)) return '选一下日期';
    if (f.date > today) return '日期不能晚于今天';
    if (intIn(f.sys, BP_RANGE.sys) == null) return '高压（收缩压）填 60–250 之间的整数';
    if (intIn(f.dia, BP_RANGE.dia) == null) return '低压（舒张压）填 30–150 之间的整数';
    if (toNumber(f.sys) <= toNumber(f.dia)) return '高压要比低压大，是不是填反了？';
    if (!isBlank(f.pulse) && intIn(f.pulse, BP_RANGE.pulse) == null) return '心率填 30–220 之间的整数，不知道可以空着';
    return null;
  }

  function addBp(state, f) {
    const record = { id: newId('p'), ...bpFields(f) };
    state.bp.push(record);
    state.bp.sort(byDateTime);
    return record;
  }

  function removeBp(state, id) {
    const index = state.bp.findIndex((r) => r.id === id);
    if (index < 0) return null;
    const [record] = state.bp.splice(index, 1);
    Mg.drop(state.removed, `bp:${id}`, record);
    return { record, index };
  }

  /** severe ≥160/110 / high ≥140/90 / low <90/60 / ok */
  function bpLevel(r) {
    if (r.sys >= 160 || r.dia >= 110) return 'severe';
    if (r.sys >= 140 || r.dia >= 90) return 'high';
    if (r.sys < 90 || r.dia < 60) return 'low';
    return 'ok';
  }

  /** 最近 7 天（含今天）的情况 */
  function bpSummary(state, today) {
    const since = D.addDays(today, -6);
    const recent = state.bp.filter((r) => r.date >= since && r.date <= today);
    const latest = state.bp.filter((r) => r.date <= today).pop() || null;
    return {
      latest,
      count: recent.length,
      high: recent.filter((r) => ['high', 'severe'].includes(bpLevel(r))).length,
      todayCount: recent.filter((r) => r.date === today).length,
    };
  }

  // ---- 血糖 ----

  function glucoseTarget(slot, after) {
    if (slot === 'fasting') return 5.3;
    if (slot === 'night') return 6.7;
    return after === 1 ? 7.8 : 6.7;
  }

  /** low 低于 3.3 / high 高于目标 / ok */
  function glucoseLevel(value, slot, after) {
    if (value < GLUCOSE_LOW) return 'low';
    return value > glucoseTarget(slot, after) ? 'high' : 'ok';
  }

  function glucoseError(f, today) {
    if (!D.isISODate(f.date)) return '选一下日期';
    if (f.date > today) return '日期不能晚于今天';
    if (slotIndex(f.slot) < 0) return '选一下是什么时候测的';
    if (parseGlucose(f.value) == null) return '血糖填 1–33.3 之间的数，单位是 mmol/L，例如 5.2';
    return null;
  }

  /** 同一天同一时间点只留一条，返回被替换掉的那条（没有就是 null） */
  function setGlucose(state, f) {
    const previous = removeGlucose(state, f.date, f.slot, false);
    state.glucose.push({ date: f.date, slot: f.slot, value: parseGlucose(f.value) });
    state.glucose.sort(byDateSlot);
    return previous;
  }

  /** mark：删掉时留个删过的标记；改数时换掉旧的那条不用留 */
  function removeGlucose(state, date, slot, mark = true) {
    const index = state.glucose.findIndex((g) => g.date === date && g.slot === slot);
    if (index < 0) return null;
    const [hit] = state.glucose.splice(index, 1);
    if (mark) Mg.drop(state.removed, `glucose:${date}/${slot}`, hit);
    return hit;
  }

  /** 按天排好，新的在前：[{ date, values: { fasting: 5.1, ... } }] */
  function glucoseDays(state) {
    const days = new Map();
    for (const g of state.glucose) {
      if (!days.has(g.date)) days.set(g.date, { date: g.date, values: {} });
      days.get(g.date).values[g.slot] = g.value;
    }
    return [...days.values()].reverse();
  }

  function glucoseSummary(state, today) {
    const after = state.prefs.glucoseAfter;
    const since = D.addDays(today, -6);
    const recent = state.glucose.filter((g) => g.date >= since && g.date <= today);
    const levels = recent.map((g) => glucoseLevel(g.value, g.slot, after));
    return {
      count: recent.length,
      high: levels.filter((l) => l === 'high').length,
      low: levels.filter((l) => l === 'low').length,
      today: state.glucose.filter((g) => g.date === today),
    };
  }

  // ---- B 超 ----

  function usError(f, today) {
    if (!D.isISODate(f.date)) return '选一下检查日期';
    if (f.date > today) return '日期不能晚于今天';
    for (const field of C.US_FIELDS) {
      const v = f.values ? f.values[field.id] : null;
      if (isBlank(v)) continue;
      const n = toNumber(v);
      if (!Number.isFinite(n) || n < field.min || n > field.max) {
        return `${field.name}填 ${field.min}–${field.max} ${field.unit} 之间的数，看看单位对不对`;
      }
    }
    const fields = usFields(f);
    if (!Object.keys(fields.values).length && !fields.placenta && !fields.note) return '至少填一项数值';
    return null;
  }

  function addUltrasound(state, f) {
    const record = { id: newId('u'), ...usFields(f) };
    state.ultrasounds.push(record);
    state.ultrasounds.sort(byDate);
    return record;
  }

  function updateUltrasound(state, id, f) {
    const record = state.ultrasounds.find((u) => u.id === id);
    if (!record) return null;
    Object.assign(record, usFields(f));
    state.ultrasounds.sort(byDate);
    return record;
  }

  function removeUltrasound(state, id) {
    const index = state.ultrasounds.findIndex((u) => u.id === id);
    if (index < 0) return null;
    const [record] = state.ultrasounds.splice(index, 1);
    Mg.drop(state.removed, `us:${id}`, record);
    return { record, index };
  }

  /** 超出一般范围时返回 low / high；只判断有公认范围的几项 */
  function usFlag(id, value) {
    if (id === 'fhr') return value < 110 ? 'low' : value > 160 ? 'high' : null;
    if (id === 'afi') return value < 5 ? 'low' : value >= 25 ? 'high' : null;
    if (id === 'dvp') return value < 2 ? 'low' : value >= 8 ? 'high' : null;
    return null;
  }

  // ---- 备份提醒 ----

  const BACKUP_FIRST = 7; // 开始用一周后还没备份过就提醒
  const BACKUP_EVERY = 30; // 之后每个月提醒一次
  const BACKUP_SNOOZE = 7; // 点了「过几天再说」，一周内不再提

  function hasRecords(state) {
    return ['weights', 'bp', 'glucose', 'ultrasounds', 'meds', 'kicks', 'contractions'].some((k) => state[k].length > 0)
      || state.checkups.some((c) => c.done || c.date);
  }

  /** 该提醒备份时返回 { last: 上次备份的日期或 null, days: 过去几天 }，不用提醒时返回 null */
  function backupReminder(state, today) {
    const { lastBackup, since, backupNudged } = state.prefs;
    if (!hasRecords(state)) return null;
    if (backupNudged && D.diffDays(backupNudged, today) < BACKUP_SNOOZE) return null;
    if (lastBackup) {
      const days = D.diffDays(lastBackup, today);
      return days >= BACKUP_EVERY ? { last: lastBackup, days } : null;
    }
    // 不知道哪天开始用的老数据，直接提醒
    if (since && D.diffDays(since, today) < BACKUP_FIRST) return null;
    return { last: null, days: null };
  }

  function markBackedUp(state, today) {
    state.prefs.lastBackup = today;
    state.prefs.backupNudged = null;
  }

  function snoozeBackup(state, today) {
    state.prefs.backupNudged = today;
  }

  // ---- 从 B 超单文字里认出数值 ----

  const US_LENGTH = new Set(['crl', 'bpd', 'hc', 'ac', 'fl']);
  // 指标名和数之间允许出现的字：同一行里的空格、冒号、约、括号里的缩写之类，最多再换一次行；
  // 不能随便跨行，不然一列指标名后面跟一列数时，会把最后一个名字配上第一个数
  const US_GAP = '[ \\t:：=约为是（）()\\[\\]【】A-Za-z~～-]{0,14}?(?:\\s*\\n[ \\t约]*)?';
  // HC/AC 1.11、头围/腹围 0.98 这类比值不是测量值，先去掉
  const US_RATIO = /([A-Za-z]{2,4}\s*[/／]\s*[A-Za-z]{2,4}|[\u4e00-\u9fff]{2,4}\s*[/／]\s*[\u4e00-\u9fff]{2,4})(?:比值|比)?\s*[:：=]?\s*\d+(?:\.\d+)?\s*%?/g;
  // 羊水指数常写成 3.2+4.1+2.8+2.5=12.6
  const US_NUM = '(\\d{1,4}(?:\\.\\d{1,2})?(?:\\s*\\+\\s*\\d{1,3}(?:\\.\\d{1,2})?)*)(?:\\s*=\\s*(\\d{1,3}(?:\\.\\d{1,2})?))?';
  const US_UNIT = '(?:\\s*[±]\\s*\\d+(?:\\.\\d+)?)?\\s*(mm|cm|毫米|厘米|kg|千克|g|克|次\\/分|bpm)?';
  const GRADES = {
    '0': '0', '０': '0',
    'Ⅰ': 'I', 'I': 'I', '1': 'I',
    'Ⅱ': 'II', 'II': 'II', '2': 'II',
    'Ⅲ': 'III', 'III': 'III', '3': 'III',
  };

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /** 英文缩写前后不能紧挨着字母，免得 FL 认成 FLOW 里的 */
  function aliasRe(alias) {
    const body = escapeRe(alias);
    return /^[A-Za-z]+$/.test(alias) ? `(?:^|[^A-Za-z])${body}(?![A-Za-z])` : body;
  }

  /** 统一换成这个指标用的单位；没写单位时按大小猜 */
  function usUnit(field, raw, n, unit) {
    const u = (unit || '').toLowerCase();
    if (US_LENGTH.has(field.id)) {
      if (u === 'cm' || u === '厘米') return n * 10;
      // 不带单位的小数（比如 6.2）多半是厘米
      if (!u && raw.includes('.') && n < 30) return n * 10;
      return n;
    }
    if (field.id === 'afi' || field.id === 'dvp') {
      if (u === 'mm' || u === '毫米' || (!u && n > field.max)) return n / 10;
      return n;
    }
    if (field.id === 'efw' && (u === 'kg' || u === '千克' || (!u && n < 7))) return n * 1000;
    return n;
  }

  /** m 是 US_NUM + US_UNIT 的匹配结果；换算后超出范围的不要 */
  function usNumber(field, m) {
    const sum = m[1].split('+').reduce((a, b) => a + Number(b), 0);
    const raw = m[2] || (m[1].includes('+') ? String(sum) : m[1]);
    const n = usUnit(field, raw, m[2] ? Number(m[2]) : sum, m[3]);
    const v = field.step >= 1 ? Math.round(n) : Math.round(n * 10) / 10;
    return v >= field.min && v <= field.max ? v : null;
  }

  function usValueIn(text, field) {
    for (const alias of field.alias) {
      const re = new RegExp(`${aliasRe(alias)}${US_GAP}${US_NUM}${US_UNIT}`, 'gi');
      for (const m of text.matchAll(re)) {
        const v = usNumber(field, m);
        if (v != null) return v;
      }
    }
    return null;
  }

  /** 表格有时会被一列一列地拷出来：先是一串指标名，再是同样多个数，按顺序配上 */
  function usColumnsIn(text, values) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const labels = C.US_FIELDS.map((f) => ({
      f,
      res: f.alias.map((a) => new RegExp(`^${escapeRe(a)}(?:\\s*[(（]\\s*[A-Za-z]{2,4}\\s*[)）]|\\s+[A-Za-z]{2,4})?\\s*[:：]?$`, 'i')),
    }));
    const labelOf = (line) => (labels.find((l) => l.res.some((re) => re.test(line))) || {}).f;
    const valueRe = new RegExp(`^约?\\s*${US_NUM}${US_UNIT}$`, 'i');
    let i = 0;
    while (i < lines.length) {
      const fields = [];
      while (i < lines.length && labelOf(lines[i])) {
        const f = labelOf(lines[i++]);
        if (!fields.includes(f)) fields.push(f);
      }
      if (!fields.length) {
        i += 1;
        continue;
      }
      // 中间可能隔着「结果」「测量值」这样的表头
      for (let skip = 0; skip < 2 && i < lines.length && !/\d/.test(lines[i]); skip += 1) i += 1;
      const nums = [];
      while (i < lines.length && nums.length < fields.length && valueRe.test(lines[i])) nums.push(lines[i++].match(valueRe));
      if (fields.length < 2 || nums.length !== fields.length) continue;
      fields.forEach((f, k) => {
        const v = usNumber(f, nums[k]);
        if (v != null && values[f.id] == null) values[f.id] = v;
      });
    }
  }

  /** 检查日期：优先找写着「检查日期 / 报告时间」的，没有就取不晚于今天的最后一个（出生日期、末次月经都更早） */
  function usDateIn(text, today) {
    const found = [];
    for (const m of text.matchAll(/(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/g)) {
      const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
      if (!D.isISODate(iso) || iso > today) continue;
      found.push({ iso, keyed: /(检查|报告|超声)(日期|时间)/.test(text.slice(Math.max(0, m.index - 10), m.index)) });
    }
    const keyed = found.find((x) => x.keyed);
    if (keyed) return keyed.iso;
    return found.length ? found.map((x) => x.iso).sort().pop() : null;
  }

  function usPlacentaIn(text) {
    const at = text.indexOf('胎盘');
    if (at < 0) return '';
    const seg = text.slice(at, at + 40);
    const place = (seg.match(/(左前壁|右前壁|左后壁|右后壁|左侧壁|右侧壁|前壁|后壁|侧壁|宫底)/) || [])[1] || '';
    const grade = (seg.match(/(III|II|I|Ⅲ|Ⅱ|Ⅰ|[0０123])\s*[级度]/) || [])[1];
    return [place, grade ? `${GRADES[grade]} 级` : ''].filter(Boolean).join(' ');
  }

  function usNoteIn(text) {
    const parts = [];
    const position = text.match(/(头位|臀位|横位|枕[左右][前后横]位?)/);
    if (position) parts.push(position[1]);
    const cord = text.match(/脐带绕颈\s*([一二两三1-3])\s*周/);
    if (cord) parts.push(`脐带绕颈${cord[1]}周`);
    const nt = text.match(/(?:^|[^A-Za-z])NT[^\d\n]{0,6}(\d(?:\.\d{1,2})?)\s*mm/i);
    if (nt) parts.push(`NT ${nt[1]} mm`);
    return parts.join('，');
  }

  /**
   * 从拷贝出来的 B 超单文字里认出数值，给表单预填用，保存前要人看一遍。
   * 返回 { values: { bpd: 62.4, ... }, date, placenta, note }，认不出的不出现
   */
  function parseUltrasoundText(text, today) {
    const s = String(text || '')
      .replace(/\r/g, '')
      // 全角的数字、字母、符号换成半角：６２ｍｍ → 62mm
      .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(US_RATIO, ' ');
    const values = {};
    usColumnsIn(s, values);
    for (const field of C.US_FIELDS) {
      if (values[field.id] != null) continue;
      const v = usValueIn(s, field);
      if (v != null) values[field.id] = v;
    }
    // 保持和 US_FIELDS 一样的顺序，表单和提示里好对照
    const ordered = {};
    for (const field of C.US_FIELDS) if (values[field.id] != null) ordered[field.id] = values[field.id];
    return { values: ordered, date: usDateIn(s, today), placenta: usPlacentaIn(s), note: usNoteIn(s) };
  }

  /** 新的在前，附上孕龄和上一次（更早一次）的记录，方便看长了多少 */
  function ultrasoundRows(state) {
    const due = state.profile.dueDate;
    const list = state.ultrasounds;
    return list
      .map((record, i) => ({ record, ga: D.gestation(due, record.date).days, prev: i ? list[i - 1] : null }))
      .reverse();
  }

  Baby.model = {
    round2,
    parseKg,
    parseHeight,
    formatKg,
    formatKgDiff,
    dueDateError,
    createState,
    normalize,
    upsertWeight,
    removeWeight,
    weightSummary,
    gainPlan,
    gainRange,
    gainStatus,
    PELVIC_HOLDS,
    PELVIC_REPS,
    PELVIC_GOAL,
    pelvicSteps,
    pelvicAt,
    addPelvicSet,
    pelvicWeek,
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
    MED_NAME_MAX,
    MED_STAGES,
    medError,
    addMed,
    updateMed,
    removeMed,
    stopMed,
    medRows,
    medTimeline,
    KICK_WINDOW,
    KICK_MERGE,
    KICK_NORMAL,
    CONTRACTION_LONG,
    countedKicks,
    activeKicks,
    settleKicks,
    startKicks,
    tapKick,
    endKicks,
    removeKicks,
    kickReview,
    activeContraction,
    keepScreenOn,
    toggleContraction,
    removeContraction,
    contractionRows,
    contractionStats,
    bpError,
    addBp,
    removeBp,
    bpLevel,
    bpSummary,
    GLUCOSE_LOW,
    parseGlucose,
    glucoseTarget,
    glucoseLevel,
    glucoseError,
    setGlucose,
    removeGlucose,
    glucoseDays,
    glucoseSummary,
    usError,
    addUltrasound,
    updateUltrasound,
    removeUltrasound,
    usFlag,
    ultrasoundRows,
    parseUltrasoundText,
    backupReminder,
    markBackedUp,
    snoozeBackup,
  };
})();
