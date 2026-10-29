(function () {
  'use strict';
  // 宝宝成长：出生信息，日常记录（亲喂、瓶喂、辅食、睡觉、尿布、体温、用药），身长体重头围和 WHO 百分位，
  // 疫苗日程，里程碑，辅食推荐。内容在 data/baby.js、data/baby-food.js，生长标准在 data/growth.js，这里不碰页面
  const Baby = globalThis.Baby || (globalThis.Baby = {});
  const D = Baby.dates;

  const SEXES = [{ id: 'boy', name: '男宝' }, { id: 'girl', name: '女宝' }];
  const TYPES = ['breast', 'bottle', 'food', 'sleep', 'diaper', 'temp', 'med'];
  const SIDES = ['left', 'right'];
  const MILKS = [{ id: 'breast', name: '母乳' }, { id: 'formula', name: '配方奶' }];
  // 吃过的食材标一下：爱吃、不爱吃、有反应（起疹子、吐、拉肚子这些）
  const FEELS = [{ id: 'like', name: '爱吃' }, { id: 'dislike', name: '不爱吃' }, { id: 'reaction', name: '有反应' }];
  const METRICS = [
    { id: 'weight', name: '体重', unit: 'kg', range: [0.5, 30] },
    { id: 'length', name: '身长', unit: 'cm', range: [30, 130] },
    { id: 'head', name: '头围', unit: 'cm', range: [20, 60] },
  ];
  // 百分位曲线画这几条：[z 值, 名字]
  const CURVES = [[-1.881, 'P3'], [-1.036, 'P15'], [0, 'P50'], [1.036, 'P85'], [1.881, 'P97']];
  // 出生时量的数比之后的范围窄
  const BIRTH_RANGE = { weight: [0.5, 6.5], length: [30, 65], head: [20, 45] };
  const BOTTLE_ML = [5, 400];
  const TEMP_RANGE = [34, 43];
  const NAME_MAX = 12;
  const TEXT_MAX = 40;
  const NOTE_MAX = 100;
  const LIST_MAX = 200;
  const ID = /^[a-z0-9-]{2,40}$/;

  const pad2 = (n) => String(n).padStart(2, '0');
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const isTime = (v) => Number.isFinite(v) && v > 0;
  const isClock = (t) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  const isId = (v) => typeof v === 'string' && ID.test(v);
  const toNumber = (v) => (typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(/[,，]/, '.')));
  const isBlank = (v) => v == null || String(v).trim() === '';
  const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const byStart = (a, b) => a.start - b.start;
  const dayOf = (ms) => D.localISO(new Date(ms));
  const secs = (v) => (Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), 4 * 3600) : 0);

  /** 某天 0 点（本地时间）的毫秒数 */
  function dayStart(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  }

  /** 日期 + "08:30" → 毫秒数（本地时间） */
  function msAt(date, time) {
    const [y, m, d] = date.split('-').map(Number);
    const [h, mi] = time.split(':').map(Number);
    return new Date(y, m - 1, d, h, mi).getTime();
  }

  /** 加几个月，日子超出那个月就取月底：1 月 31 日加 1 个月是 2 月底 */
  function addMonths(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    const t = m - 1 + n;
    const yy = y + Math.floor(t / 12);
    const mm = ((t % 12) + 12) % 12;
    const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
    return `${yy}-${pad2(mm + 1)}-${pad2(Math.min(d, last))}`;
  }

  /** 出生后的年龄：days 出生当天是 0；months 满了几个月，rest 再多几天 */
  function ageOf(birthDate, on) {
    const days = D.diffDays(birthDate, on);
    const [by, bm] = birthDate.split('-').map(Number);
    const [y, m] = on.split('-').map(Number);
    let months = Math.max(0, (y - by) * 12 + (m - bm));
    while (months > 0 && addMonths(birthDate, months) > on) months -= 1;
    return { days, months, rest: days < 0 ? 0 : D.diffDays(addMonths(birthDate, months), on) };
  }

  /** 3 天 / 2 个月 5 天 / 1 岁 3 个月 */
  function ageText({ days, months, rest }) {
    if (days < 0) return '还没出生';
    if (months < 1) return `${days} 天`;
    if (months < 12) return `${months} 个月${rest ? ` ${rest} 天` : ''}`;
    return `${Math.floor(months / 12)} 岁${months % 12 ? ` ${months % 12} 个月` : ''}`;
  }

  /** 月龄的叫法：0 → 出生，8 → 8 月龄，24 → 2 岁 */
  const monthsText = (n) => (n === 0 ? '出生' : n < 24 || n % 12 ? `${n} 月龄` : `${n / 12} 岁`);

  // ---------- 出生 ----------

  function parseMetric(id, v) {
    if (isBlank(v)) return null;
    let n = toNumber(String(v).replace(/(kg|公斤|千克|cm|厘米)$/i, ''));
    if (id === 'weight' && /斤$/.test(String(v).trim())) n = toNumber(String(v).trim().replace(/斤$/, '')) / 2;
    const { range } = METRICS.find((x) => x.id === id);
    return Number.isFinite(n) && n >= range[0] && n <= range[1] ? Math.round(n * 100) / 100 : null;
  }

  /** 出生表单：{ name, sex, birthDate, birthTime, weight, length, head } */
  function birthError(f, today, dueDate) {
    if (!SEXES.some((s) => s.id === f.sex)) return '选一下是男宝还是女宝';
    if (!D.isISODate(f.birthDate)) return '选一下出生日期';
    if (f.birthDate > today) return '出生日期不能晚于今天';
    if (dueDate && D.diffDays(f.birthDate, dueDate) > 20 * 7) return '出生日期离预产期太远了，再确认一下？';
    if (f.birthTime && !isClock(f.birthTime)) return '出生时间填成 08:30 这样';
    for (const m of METRICS) {
      if (isBlank(f[m.id])) continue;
      const [lo, hi] = BIRTH_RANGE[m.id];
      const n = parseMetric(m.id, f[m.id]);
      if (n == null || n < lo || n > hi) return `出生${m.name}填 ${lo}–${hi} ${m.unit} 之间的数`;
    }
    return null;
  }

  function born(f) {
    const first = { date: f.birthDate, weight: parseMetric('weight', f.weight), length: parseMetric('length', f.length), head: parseMetric('head', f.head) };
    return {
      name: text(f.name, NAME_MAX),
      sex: f.sex,
      birthDate: f.birthDate,
      birthTime: isClock(f.birthTime) ? f.birthTime : '',
      logs: [],
      growth: METRICS.some((m) => first[m.id] != null) ? [first] : [],
      vaccines: {},
      extraVaccines: [],
      exams: {},
      papers: {},
      milestones: {},
      moments: [],
      tried: {},
      foodNotes: {},
    };
  }

  /** 改宝宝信息：出生那天量的数也跟着改 */
  function updateBirth(b, f) {
    const old = b.birthDate;
    b.name = text(f.name, NAME_MAX);
    b.sex = f.sex;
    b.birthDate = f.birthDate;
    b.birthTime = isClock(f.birthTime) ? f.birthTime : '';
    b.growth = b.growth.filter((g) => g.date !== old);
    const first = { date: f.birthDate, weight: parseMetric('weight', f.weight), length: parseMetric('length', f.length), head: parseMetric('head', f.head) };
    if (METRICS.some((m) => first[m.id] != null)) setGrowth(b, first);
  }

  // ---------- 清理存储里的数据 ----------

  function normalizeLog(l) {
    if (!l || typeof l !== 'object' || !TYPES.includes(l.type) || !isId(l.id) || !isTime(l.start)) return null;
    const base = { id: l.id, type: l.type, start: l.start, note: text(l.note, NOTE_MAX) };
    const end = isTime(l.end) && l.end >= l.start ? l.end : null;
    switch (l.type) {
      case 'breast': {
        const e = { ...base, end, left: secs(l.left), right: secs(l.right), side: null, since: null };
        if (end == null && SIDES.includes(l.side) && isTime(l.since)) {
          e.side = l.side;
          e.since = l.since;
        } else if (end == null) {
          e.end = l.start + (e.left + e.right) * 1000;
        }
        return e;
      }
      case 'bottle': {
        const ml = Math.round(toNumber(l.ml));
        if (!(ml >= BOTTLE_ML[0] && ml <= BOTTLE_ML[1])) return null;
        return { ...base, ml, milk: MILKS.some((m) => m.id === l.milk) ? l.milk : 'formula' };
      }
      case 'food': {
        const what = text(l.text, TEXT_MAX);
        return what ? { ...base, text: what, amount: text(l.amount, 20), recipe: isId(l.recipe) ? l.recipe : '' } : null;
      }
      case 'sleep':
        return { ...base, end };
      case 'diaper':
        if (!l.pee && !l.poo) return null;
        return { ...base, pee: Boolean(l.pee), poo: Boolean(l.poo), color: l.poo && typeof l.color === 'string' && /^[a-z]{3,8}$/.test(l.color) ? l.color : '' };
      case 'temp': {
        const value = Math.round(toNumber(l.value) * 10) / 10;
        if (!(value >= TEMP_RANGE[0] && value <= TEMP_RANGE[1])) return null;
        return { ...base, value, site: ['armpit', 'ear', 'forehead'].includes(l.site) ? l.site : 'armpit' };
      }
      default: {
        const name = text(l.name, 20);
        return name ? { ...base, name, dose: text(l.dose, 20) } : null;
      }
    }
  }

  function normalizeGrowth(g) {
    if (!g || !D.isISODate(g.date)) return null;
    const out = { date: g.date };
    for (const m of METRICS) out[m.id] = g[m.id] == null ? null : parseMetric(m.id, g[m.id]);
    return METRICS.some((m) => out[m.id] != null) ? out : null;
  }

  const datedMap = (raw, ok) => {
    const out = {};
    if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw)) if (ok(k) && D.isISODate(v)) out[k] = v;
    return out;
  };

  function foodNotesOf(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [name, v] of Object.entries(raw)) {
      if (text(name, 20) !== name || !name || !v || !FEELS.some((f) => f.id === v.feel)) continue;
      out[name] = { feel: v.feel, note: text(v.note, 40), date: D.isISODate(v.date) ? v.date : null };
    }
    return out;
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || !D.isISODate(raw.birthDate)) return null;
    const logs = (Array.isArray(raw.logs) ? raw.logs : []).map(normalizeLog).filter(Boolean);
    const seen = new Set();
    const unique = logs.filter((l) => !seen.has(l.id) && seen.add(l.id)).sort(byStart);
    // 同一种计时最多只能有一个在进行，多出来的按开始时间收尾
    for (const type of ['breast', 'sleep']) {
      const open = unique.filter((l) => l.type === type && l.end == null);
      open.slice(0, -1).forEach((l) => {
        if (type === 'breast') {
          l.side = null;
          l.since = null;
          l.end = l.start + (l.left + l.right) * 1000;
        } else {
          l.end = l.start;
        }
      });
    }
    const growth = new Map();
    for (const g of Array.isArray(raw.growth) ? raw.growth : []) {
      const item = normalizeGrowth(g);
      if (item) growth.set(item.date, item);
    }
    // 疫苗、体检：{ 编号: { done 哪天做的, booked 约在哪天 } }
    const bookings = (items) => {
      const out = {};
      if (items && typeof items === 'object') {
        for (const [id, v] of Object.entries(items)) {
          if (!isId(id) || !v || typeof v !== 'object') continue;
          const rec = { done: D.isISODate(v.done) ? v.done : null, booked: D.isISODate(v.booked) ? v.booked : null };
          if (rec.done || rec.booked) out[id] = rec;
        }
      }
      return out;
    };
    const list = (items, fix) => (Array.isArray(items) ? items.map(fix).filter(Boolean).slice(0, LIST_MAX) : []);
    return {
      name: text(raw.name, NAME_MAX),
      sex: SEXES.some((s) => s.id === raw.sex) ? raw.sex : 'boy',
      birthDate: raw.birthDate,
      birthTime: isClock(raw.birthTime) ? raw.birthTime : '',
      logs: unique,
      growth: [...growth.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
      vaccines: bookings(raw.vaccines),
      extraVaccines: list(raw.extraVaccines, (v) => (v && isId(v.id) && text(v.name, 20) && D.isISODate(v.date)
        ? { id: v.id, name: text(v.name, 20), date: v.date, done: v.done === true } : null)),
      exams: bookings(raw.exams),
      papers: datedMap(raw.papers, isId),
      milestones: datedMap(raw.milestones, isId),
      moments: list(raw.moments, (m) => (m && isId(m.id) && text(m.name, 20) && D.isISODate(m.date) ? { id: m.id, name: text(m.name, 20), date: m.date } : null)),
      tried: datedMap(raw.tried, (k) => text(k, 20) === k && k.length > 0),
      foodNotes: foodNotesOf(raw.foodNotes),
    };
  }

  // ---------- 日常记录 ----------

  function insert(b, entry) {
    b.logs.push(entry);
    b.logs.sort(byStart);
    return entry;
  }

  const running = (b, type) => b.logs.find((l) => l.type === type && l.end == null) || null;

  function accrue(e, now) {
    if (e.side && e.since) e[e.side] += Math.max(0, Math.round((now - e.since) / 1000));
    e.since = e.side ? now : null;
  }

  /** 亲喂：开始喂某一边；正在喂另一边就换过去 */
  function startBreast(b, side, now) {
    if (!SIDES.includes(side)) return null;
    const cur = running(b, 'breast');
    if (cur) {
      if (cur.side !== side) {
        accrue(cur, now);
        cur.side = side;
        cur.since = now;
      }
      return cur;
    }
    return insert(b, { id: newId('bf'), type: 'breast', start: now, end: null, left: 0, right: 0, side, since: now, note: '' });
  }

  function stopBreast(b, now) {
    const cur = running(b, 'breast');
    if (!cur) return null;
    accrue(cur, now);
    cur.side = null;
    cur.since = null;
    cur.end = Math.max(now, cur.start);
    return cur;
  }

  /** 两边各喂了几秒，算上正在喂的这一段 */
  function breastSeconds(e, now) {
    const extra = e.side && e.since ? Math.max(0, Math.round((now - e.since) / 1000)) : 0;
    return { left: e.left + (e.side === 'left' ? extra : 0), right: e.right + (e.side === 'right' ? extra : 0) };
  }

  // 下次喂奶按最近 24 小时里两次喂奶的间隔估；隔了 5 小时以上的多半是夜里睡长觉，不算进来
  const FEED_WINDOW = 24 * 3600000;
  const FEED_GAP_MAX = 5 * 3600000;
  const FEED_STALE = 8 * 3600000;

  /**
   * 大约什么时候会饿：{ at（到 5 分钟）, gap 间隔的中位数（分钟）, due 已经到点了 }；
   * 正在亲喂、最近记得太少、上次喂已经过去 8 小时以上时是 null
   */
  function nextFeed(b, now) {
    if (running(b, 'breast')) return null;
    const starts = b.logs.filter((l) => (l.type === 'breast' || l.type === 'bottle') && l.start <= now && l.start > now - FEED_WINDOW).map((l) => l.start);
    const gaps = starts.slice(1).map((t, i) => t - starts[i]).filter((g) => g > 0 && g <= FEED_GAP_MAX).sort((x, y) => x - y);
    const last = starts[starts.length - 1];
    if (gaps.length < 2 || now - last > FEED_STALE) return null;
    const half = gaps.length >> 1;
    const mid = gaps.length % 2 ? gaps[half] : (gaps[half - 1] + gaps[half]) / 2;
    const at = Math.round((last + mid) / 300000) * 300000;
    return { at, gap: Math.round(mid / 60000), due: at <= now };
  }

  function startSleep(b, now) {
    return running(b, 'sleep') || insert(b, { id: newId('sl'), type: 'sleep', start: now, end: null, note: '' });
  }

  function stopSleep(b, now) {
    const cur = running(b, 'sleep');
    if (cur) cur.end = Math.max(now, cur.start);
    return cur;
  }

  /** 尿布马上记一笔：what 是 'pee' / 'poo' / 'both' */
  function quickDiaper(b, what, now) {
    return insert(b, { id: newId('dp'), type: 'diaper', start: now, pee: what !== 'poo', poo: what !== 'pee', color: '', note: '' });
  }

  /**
   * 面板里的表单 → 一条记录的内容；有错时返回 { error }。
   * f: { date, time, note, 以及每种自己的：left/right（分钟）、ml、milk、text、amount、recipe、endTime、pee、poo、color、value、site、name、dose }
   */
  function readLog(type, f, now) {
    if (!TYPES.includes(type)) return { error: '记的是什么？' };
    if (!D.isISODate(f.date) || !isClock(f.time)) return { error: '选一下日期和时间' };
    const start = msAt(f.date, f.time);
    if (start > now + 60000) return { error: '时间不能晚于现在' };
    const out = { type, start, note: text(f.note, NOTE_MAX) };
    switch (type) {
      case 'breast': {
        const left = isBlank(f.left) ? 0 : toNumber(f.left);
        const right = isBlank(f.right) ? 0 : toNumber(f.right);
        if (!(left >= 0 && right >= 0 && left + right > 0 && left + right <= 120)) return { error: '两边一共喂了几分钟？填 1–120 之间的数' };
        return { ...out, left: Math.round(left * 60), right: Math.round(right * 60), end: start + Math.round((left + right) * 60) * 1000, side: null, since: null };
      }
      case 'bottle': {
        const ml = Math.round(toNumber(f.ml));
        if (!(ml >= BOTTLE_ML[0] && ml <= BOTTLE_ML[1])) return { error: `喝了多少毫升？填 ${BOTTLE_ML[0]}–${BOTTLE_ML[1]} 之间的数` };
        return { ...out, ml, milk: MILKS.some((m) => m.id === f.milk) ? f.milk : 'formula' };
      }
      case 'food': {
        const what = text(f.text, TEXT_MAX);
        if (!what) return { error: '吃了什么？写一下' };
        return { ...out, text: what, amount: text(f.amount, 20), recipe: isId(f.recipe) ? f.recipe : '' };
      }
      case 'sleep': {
        if (!isClock(f.endTime)) return { ...out, end: null };
        let end = msAt(f.date, f.endTime);
        if (end <= start) end = msAt(D.addDays(f.date, 1), f.endTime);
        if (end - start > 24 * 3600000) return { error: '一觉最长记 24 小时' };
        if (end > now + 60000) return { error: '醒来的时间不能晚于现在' };
        return { ...out, end };
      }
      case 'diaper':
        if (!f.pee && !f.poo) return { error: '选一下是尿了还是便了' };
        return { ...out, pee: Boolean(f.pee), poo: Boolean(f.poo), color: f.poo && typeof f.color === 'string' ? f.color : '' };
      case 'temp': {
        const value = Math.round(toNumber(f.value) * 10) / 10;
        if (!(value >= TEMP_RANGE[0] && value <= TEMP_RANGE[1])) return { error: '体温填 34–43 之间的数，例如 36.8' };
        return { ...out, value, site: ['armpit', 'ear', 'forehead'].includes(f.site) ? f.site : 'armpit' };
      }
      default: {
        const name = text(f.name, 20);
        if (!name) return { error: '吃的什么药？写一下名字' };
        return { ...out, name, dose: text(f.dose, 20) };
      }
    }
  }

  function addLog(b, fields) {
    if (fields.type === 'sleep' && fields.end == null && running(b, 'sleep')) stopSleep(b, fields.start);
    return insert(b, { id: newId(fields.type.slice(0, 2)), ...fields });
  }

  /** 改一条：在进行中的计时不动结束和正在喂哪边 */
  function updateLog(b, id, fields) {
    const e = b.logs.find((l) => l.id === id);
    if (!e) return null;
    const keep = e.end == null && fields.end === undefined ? { end: null, side: e.side, since: e.since } : {};
    Object.assign(e, fields, keep);
    b.logs.sort(byStart);
    return e;
  }

  function removeLog(b, id) {
    const index = b.logs.findIndex((l) => l.id === id);
    return index < 0 ? null : { entry: b.logs.splice(index, 1)[0], index };
  }

  function restoreLog(b, removed) {
    b.logs.splice(Math.min(removed.index, b.logs.length), 0, removed.entry);
  }

  /** 某天的记录（按开始的时间算在哪天），新的在前 */
  const dayLogs = (b, date) => b.logs.filter((l) => dayOf(l.start) === date).reverse();

  const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

  /** 某天的小结；睡觉按落在这天里的时长算，跨过半夜的分到两天 */
  function daySummary(b, date, now) {
    const logs = dayLogs(b, date);
    const from = dayStart(date);
    const to = dayStart(D.addDays(date, 1));
    const of = (type) => logs.filter((l) => l.type === type);
    const breastSec = of('breast').reduce((s, l) => { const t = breastSeconds(l, now); return s + t.left + t.right; }, 0);
    const sleepMs = b.logs.filter((l) => l.type === 'sleep').reduce((s, l) => s + overlap(l.start, l.end ?? now, from, Math.min(to, now)), 0);
    const diapers = of('diaper');
    const feeds = b.logs.filter((l) => (l.type === 'breast' || l.type === 'bottle') && l.start <= now);
    return {
      logs,
      feeds: of('breast').length + of('bottle').length,
      breastMin: Math.round(breastSec / 60),
      bottleMl: of('bottle').reduce((s, l) => s + l.ml, 0),
      sleepMin: Math.round(sleepMs / 60000),
      diapers: diapers.length,
      pee: diapers.filter((l) => l.pee).length,
      poo: diapers.filter((l) => l.poo).length,
      foods: of('food').length,
      lastFeed: feeds.length ? feeds[feeds.length - 1].start : null,
    };
  }

  // 每天睡多久的参考（含白天小睡）：4 个月以下按美国国家睡眠基金会，4 个月到 5 岁按美国睡眠医学会（美国儿科学会认可）
  const SLEEP_NEED = [[4, [14, 17]], [12, [12, 16]], [36, [11, 14]], [72, [10, 13]]];

  /** 这个月龄每天一般睡几小时 [少, 多]；6 岁以后是 null */
  function sleepNeed(months) {
    const hit = SLEEP_NEED.find(([to]) => months < to);
    return hit ? hit[1] : null;
  }

  /** 最近 7 天（含今天）每天的小结，出生前的日子不算；has 是这天有没有记过东西 */
  function weekSummary(b, today, now) {
    return Array.from({ length: 7 }, (_, i) => D.addDays(today, i - 6)).filter((d) => d >= b.birthDate).map((date) => {
      const s = daySummary(b, date, now);
      return { date, ...s, has: s.logs.length > 0 || s.sleepMin > 0 };
    });
  }

  // ---------- 身长体重头围、WHO 百分位 ----------

  function growthError(b, f, today) {
    if (!D.isISODate(f.date)) return '选一下哪天量的';
    if (f.date > today) return '日期不能晚于今天';
    if (f.date < b.birthDate) return '日期不能早于出生那天';
    if (METRICS.every((m) => isBlank(f[m.id]))) return '体重、身长、头围至少填一样';
    for (const m of METRICS) {
      if (!isBlank(f[m.id]) && parseMetric(m.id, f[m.id]) == null) return `${m.name}填 ${m.range[0]}–${m.range[1]} ${m.unit} 之间的数`;
    }
    return null;
  }

  /** 同一天只留一条，返回被替换掉的那条（没有就是 null） */
  function setGrowth(b, f) {
    const previous = b.growth.find((g) => g.date === f.date) || null;
    const item = { date: f.date };
    for (const m of METRICS) item[m.id] = parseMetric(m.id, f[m.id]);
    b.growth = b.growth.filter((g) => g.date !== f.date).concat(item).sort((x, y) => (x.date < y.date ? -1 : 1));
    return previous;
  }

  function removeGrowth(b, date) {
    const index = b.growth.findIndex((g) => g.date === date);
    return index < 0 ? null : b.growth.splice(index, 1)[0];
  }

  /** 某天的 L、M、S：按周取的点之间线性插值；超出 0–2 岁返回 null */
  function lmsAt(std, metric, sex, day) {
    const days = std.days;
    if (day < 0 || day > days[days.length - 1]) return null;
    const rows = std[metric][sex];
    let i = days.findIndex((d) => d >= day);
    if (days[i] === day) return rows[i];
    i -= 1;
    const t = (day - days[i]) / (days[i + 1] - days[i]);
    return rows[i].map((v, k) => v + (rows[i + 1][k] - v) * t);
  }

  function zScore(std, metric, sex, day, value) {
    const lms = lmsAt(std, metric, sex, day);
    if (!lms || !(value > 0)) return null;
    const [L, M, S] = lms;
    return L ? (Math.pow(value / M, L) - 1) / (L * S) : Math.log(value / M) / S;
  }

  function valueAt(std, metric, sex, day, z) {
    const [L, M, S] = lmsAt(std, metric, sex, day);
    return L ? M * Math.pow(1 + L * S * z, 1 / L) : M * Math.exp(S * z);
  }

  /** 标准正态分布的累积概率（Abramowitz–Stegun 7.1.26，误差在 1e-7 以内） */
  function normalCdf(z) {
    const x = Math.abs(z) / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * x);
    const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
  }

  /** 大约第几百分位：每 100 个同龄同性别的宝宝里排第几 */
  const percentile = (z) => Math.min(99, Math.max(1, Math.round(normalCdf(z) * 100)));

  /** 偏低（低于 P3）/ 偏高（高于 P97）/ 正常 */
  const growthLevel = (z) => (z < -1.881 ? 'low' : z > 1.881 ? 'high' : 'ok');

  /** 每次量的数，带上那天几天大、在第几百分位 */
  function growthRows(b, std) {
    return b.growth.map((g) => {
      const day = D.diffDays(b.birthDate, g.date);
      const z = {};
      for (const m of METRICS) z[m.id] = g[m.id] == null ? null : zScore(std, m.id, b.sex, day, g[m.id]);
      return { ...g, day, z };
    });
  }

  /** 百分位曲线：[{ label, points: [[天, 数值]] }]，画到 maxDay 为止 */
  function curves(std, metric, sex, maxDay) {
    const days = std.days.filter((d) => d <= maxDay);
    if (days[days.length - 1] < maxDay && maxDay <= std.days[std.days.length - 1]) days.push(maxDay);
    return CURVES.map(([z, label]) => ({ label, points: days.map((d) => [d, valueAt(std, metric, sex, d, z)]) }));
  }

  // ---------- 疫苗 ----------

  /** 每一针：最早可以打的日子、建议打完的日子，状态 done / late（过了建议时间）/ due（可以打了）/ soon（两周内）/ later */
  function vaccineRows(b, book, today) {
    return book.vaccines.map(([id, name, dose, from, by, note]) => {
      const rec = b.vaccines[id] || {};
      const due = addMonths(b.birthDate, from);
      const deadline = by == null ? null : addMonths(b.birthDate, by);
      let status = 'later';
      if (rec.done) status = 'done';
      else if (deadline && today >= deadline) status = 'late';
      else if (today >= due) status = 'due';
      else if (D.diffDays(today, due) <= 14) status = 'soon';
      return { id, name, dose, from, by, note, due, deadline, done: rec.done || null, booked: rec.booked || null, status, when: monthsText(from) };
    });
  }

  /** 下一针：还没打的里面，约好的日子或最早可以打的日子最近的那针 */
  function nextVaccine(rows) {
    const open = rows.filter((r) => r.status !== 'done');
    return open.sort((a, b) => ((a.booked || a.due) < (b.booked || b.due) ? -1 : 1))[0] || null;
  }

  /** 今天、明天约了的，和今天刚好可以打的 */
  function vaccineReminders(rows, today) {
    const tomorrow = D.addDays(today, 1);
    return rows.filter((r) => r.status !== 'done' && (r.booked ? r.booked === today || r.booked === tomorrow : r.due === today));
  }

  function setVaccine(b, id, patch) {
    const rec = { done: null, booked: null, ...(b.vaccines[id] || {}), ...patch };
    if (rec.done || rec.booked) b.vaccines[id] = rec;
    else delete b.vaccines[id];
  }

  function addExtraVaccine(b, f) {
    const v = { id: newId('xv'), name: text(f.name, 20), date: f.date, done: f.done === true };
    b.extraVaccines.push(v);
    b.extraVaccines.sort((x, y) => (x.date < y.date ? -1 : 1));
    return v;
  }

  // ---------- 儿保体检 ----------

  /**
   * 每次体检的时间窗口 [from, to] 和状态：done 做过了 / late 过了窗口没记 / due 在窗口里 / soon 两周内开始 / later；
   * 按月龄的从满月那天到这个月龄的第 29 天，按天的是出生后第几天到第几天
   */
  function examRows(b, book, today) {
    return book.exams.map((e) => {
      const rec = b.exams[e.id] || {};
      const from = e.months != null ? addMonths(b.birthDate, e.months) : D.addDays(b.birthDate, e.days[0]);
      const to = e.months != null ? D.addDays(from, 29) : D.addDays(b.birthDate, e.days[1]);
      let status = 'later';
      if (rec.done) status = 'done';
      else if (today > to) status = 'late';
      else if (today >= from) status = 'due';
      else if (D.diffDays(today, from) <= 14) status = 'soon';
      return {
        id: e.id, name: e.name, who: e.who || 'baby', where: e.where || book.examWhere, items: e.items, watch: e.watch || [], note: e.note || '',
        from, to, done: rec.done || null, booked: rec.booked || null, status,
      };
    });
  }

  /** 下一次：还没做、也没过时间的里面，约好的日子或者窗口开始那天最近的 */
  function nextExam(rows) {
    const open = rows.filter((r) => r.status !== 'done' && r.status !== 'late');
    return open.sort((a, b) => ((a.booked || a.from) < (b.booked || b.from) ? -1 : 1))[0] || null;
  }

  /** 今天、明天约了体检的 */
  function examReminders(rows, today) {
    const tomorrow = D.addDays(today, 1);
    return rows.filter((r) => r.status !== 'done' && (r.booked === today || r.booked === tomorrow));
  }

  function setExam(b, id, patch) {
    const rec = { done: null, booked: null, ...(b.exams[id] || {}), ...patch };
    if (rec.done || rec.booked) b.exams[id] = rec;
    else delete b.exams[id];
  }

  /** 过了时间没记的，一起记成做过了（日子按约的那天，没约就按窗口开始那天）；返回改之前的样子，撤销用 */
  function markPastExams(b, book, today) {
    const before = { ...b.exams };
    for (const r of examRows(b, book, today)) if (r.status === 'late') setExam(b, r.id, { done: r.booked || r.from });
    return before;
  }

  // ---------- 出生后要办的事 ----------

  /**
   * 每件事：done 办好的日子；wait 还没办好的前置事项；by 最好在哪天前办；
   * status：done / waiting（前面的还没办好）/ late（过了最好办的日子）/ soon（两周内到期）/ todo
   */
  function paperRows(b, book, today) {
    return book.papers.map((p) => {
      const done = b.papers[p.id] || null;
      const wait = (p.after || []).filter((id) => !b.papers[id]);
      let by = null;
      if (p.by && p.by.months) by = addMonths(b.birthDate, p.by.months);
      if (p.by && p.by.years) by = `${Number(b.birthDate.slice(0, 4)) + p.by.years}-12-31`;
      let status = 'todo';
      if (done) status = 'done';
      else if (wait.length) status = 'waiting';
      else if (by && today > by) status = 'late';
      else if (by && D.diffDays(today, by) <= 14) status = 'soon';
      return { ...p, done, wait, by, status };
    });
  }

  /** 下一件：前面都办好了的里面最靠前的，没有就是还没办的第一件 */
  function nextPaper(rows) {
    const open = rows.filter((r) => !r.done);
    return open.find((r) => !r.wait.length) || open[0] || null;
  }

  /** 勾上或取消；返回勾之前的日子，撤销用 */
  function togglePaper(b, id, today) {
    const before = b.papers[id] || null;
    if (before) delete b.papers[id];
    else b.papers[id] = today;
    return before;
  }

  // ---------- 里程碑 ----------

  /** 预设的里程碑：done 记过了 / now 多数宝宝这阵子会 / soon 还早 / past 一般已经会了，还没记 */
  function milestoneRows(b, book, today) {
    const age = ageOf(b.birthDate, today).months;
    return book.milestones.map(([id, name, from, to]) => {
      const date = b.milestones[id] || null;
      let status = 'soon';
      if (date) status = 'done';
      else if (age >= to) status = 'past';
      else if (age >= from) status = 'now';
      return { id, name, from, to, date, status, at: date ? ageOf(b.birthDate, date) : null };
    });
  }

  function addMoment(b, name, date) {
    const m = { id: newId('mo'), name: text(name, 20), date };
    b.moments.push(m);
    b.moments.sort((x, y) => (x.date < y.date ? -1 : 1));
    return m;
  }

  // ---------- 体温 ----------

  /** cool 偏低 / normal / low 低热 / mid 中等发热 / high 高热；按部位换算 */
  function tempLevel(book, value, site) {
    const [, , from] = book.feverSites.find(([id]) => id === site) || book.feverSites[0];
    if (value < from - 1.5) return 'cool';
    const over = Math.round((value - from) * 10) / 10;
    if (over < 0) return 'normal';
    if (over < 0.6) return 'low';
    if (over < 1.6) return 'mid';
    return 'high';
  }

  const isFever = (level) => level === 'low' || level === 'mid' || level === 'high';

  // ---------- 辅食 ----------

  /** 现在在哪个阶段；不满 6 个月返回 null */
  function foodStage(book, months) {
    if (months < 6) return null;
    return book.foodStages.find((s) => months >= s.from && months < s.to) || book.foodStages[book.foodStages.length - 1];
  }

  /** 这道菜里还没吃过的食材 */
  const newFoods = (food, b, recipe) => recipe.items.map((i) => i[0]).filter((n) => !food.plain.includes(n) && !b.tried[n]);

  /** 这道菜里宝宝吃了有过反应的食材 */
  const reactionsIn = (b, recipe) => recipe.items.map((i) => i[0]).filter((n) => b.foodNotes[n] && b.foodNotes[n].feel === 'reaction');

  /** 标一下吃得怎么样；feel 为空就是不标了 */
  function setFoodNote(b, name, feel, note, date) {
    if (!FEELS.some((f) => f.id === feel)) delete b.foodNotes[name];
    else b.foodNotes[name] = { feel, note: text(note, 40), date };
  }

  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /**
   * 今天做什么：从现在这个阶段和更早的里挑，按日期轮着来。
   * 一天最多一道带新食材的（新食材也只能有一样），刚加过新食材的 3 天里不再加；刚开始优先补铁的
   */
  function foodToday(food, book, b, date) {
    const months = ageOf(b.birthDate, date).months;
    const stage = foodStage(book, Math.max(months, 6));
    const pool = food.recipes.filter((r) => r.stage <= stage.from && !reactionsIn(b, r).length)
      .sort((x, y) => hash(`${date}/${x.id}`) - hash(`${date}/${y.id}`));
    const recent = Object.values(b.tried).some((d) => D.diffDays(d, date) < 3);
    const iron = Object.keys(b.tried).length < 3;
    const fresh = recent ? [] : pool.filter((r) => newFoods(food, b, r).length === 1)
      .sort((x, y) => (iron ? (y.good.includes('iron') ? 1 : 0) - (x.good.includes('iron') ? 1 : 0) : 0));
    const known = pool.filter((r) => newFoods(food, b, r).length === 0);
    const count = months < 7 ? 2 : 3;
    return [...fresh.slice(0, 1), ...known].slice(0, count);
  }

  /** 吃过哪些：从辅食记录里来，也可以自己点 */
  function markTried(food, b, recipe, date) {
    for (const [name] of recipe.items) if (!food.plain.includes(name) && (!b.tried[name] || b.tried[name] > date)) b.tried[name] = date;
  }

  function toggleTried(b, name, date) {
    if (b.tried[name]) delete b.tried[name];
    else b.tried[name] = date;
    return Boolean(b.tried[name]);
  }

  /** 辅食里出现过的所有食材，按第一次出现的阶段排 */
  function foodList(food) {
    const out = [];
    for (const r of [...food.recipes].sort((x, y) => x.stage - y.stage)) {
      for (const [name] of r.items) if (!food.plain.includes(name) && !out.includes(name)) out.push(name);
    }
    return out;
  }

  Baby.baby = {
    SEXES,
    TYPES,
    MILKS,
    FEELS,
    METRICS,
    CURVES,
    dayOf,
    dayStart,
    msAt,
    addMonths,
    ageOf,
    ageText,
    monthsText,
    parseMetric,
    birthError,
    born,
    updateBirth,
    normalize,
    running,
    startBreast,
    stopBreast,
    breastSeconds,
    startSleep,
    stopSleep,
    quickDiaper,
    readLog,
    addLog,
    updateLog,
    removeLog,
    restoreLog,
    dayLogs,
    daySummary,
    growthError,
    setGrowth,
    removeGrowth,
    lmsAt,
    zScore,
    valueAt,
    normalCdf,
    percentile,
    growthLevel,
    growthRows,
    curves,
    vaccineRows,
    nextVaccine,
    vaccineReminders,
    setVaccine,
    addExtraVaccine,
    examRows,
    nextExam,
    examReminders,
    setExam,
    markPastExams,
    paperRows,
    nextPaper,
    togglePaper,
    nextFeed,
    sleepNeed,
    weekSummary,
    reactionsIn,
    setFoodNote,
    milestoneRows,
    addMoment,
    tempLevel,
    isFever,
    foodStage,
    newFoods,
    foodToday,
    markTried,
    toggleTried,
    foodList,
  };
})();
