(function () {
  'use strict';
  // 两台手机合并记录：把对方有、这台没有的加进来；两边都有、内容不一样的同一条，取后改的那边。
  // 每次保存时比一比哪些记录变了，记下「什么时候改的」（edits）；分不出先后（以前的版本记的）时以这台为准。
  // 删掉的记录留一个「删过」的标记（编号 + 内容的指纹，removed）。合并时，另一台上一模一样的那条也删掉，免得删了又回来；
  // 标记只在这一边确实没有这条时才算数，撤销删除后自然就不作数了
  const Baby = globalThis.Baby || (globalThis.Baby = {});
  const D = Baby.dates;

  const KEEP_DAYS = 180;
  const KEEP_REMOVED = 500;
  const KEEP_EDITS = 3000;
  const DAY = 24 * 3600 * 1000;

  const byId = (x) => x.id;
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  // 每样记录放在哪、编号怎么取、合并时叫什么；记「改过」、记「删过」、合并都按这张表
  const LISTS = [
    ['weight', 'weights', '体重', (w) => w.date],
    ['bp', 'bp', '血压'],
    ['glucose', 'glucose', '血糖', (g) => `${g.date}/${g.slot}`],
    ['med', 'meds', '用药和补剂'],
    ['us', 'ultrasounds', 'B 超'],
    ['journal', 'journal', '心情'],
    ['kick', 'kicks', '数胎动'],
    ['contraction', 'contractions', '宫缩'],
    ['checkup', 'checkups', '产检'],
    ['bag', 'bag', '待产包'],
  ];
  const BABY_LISTS = [
    ['log', 'logs', '宝宝的日常记录'],
    ['growth', 'growth', '身长体重', (g) => g.date],
    ['moment', 'moments', '其它的第一次'],
    ['xv', 'extraVaccines', '自费疫苗'],
    ['stash', 'stash', '存奶'],
  ];
  const BABY_MAPS = [
    ['vaccine', 'vaccines', '疫苗'],
    ['exam', 'exams', '体检'],
    ['paper', 'papers', '办证清单'],
    ['milestone', 'milestones', '里程碑'],
    ['tooth', 'teeth', '长牙'],
    ['tried', 'tried', '吃过的食材'],
    ['food', 'foodNotes', '辅食的标记'],
  ];
  const profileOf = (p) => ({ dueDate: p.dueDate, preWeight: p.preWeight, height: p.height, nickname: p.nickname });
  const birthOf = (b) => ({ name: b.name, sex: b.sex, birthDate: b.birthDate, birthTime: b.birthTime });
  // 设置里两台手机共用的：餐后几小时测血糖
  const sharedPrefs = (p) => ({ glucoseAfter: p.glucoseAfter });

  // 藏在别的结构里、两台手机要同步的几样：拍平成 { 编号: 值 }，记改过的时间、合并都和疫苗那些一样，
  // 去掉的也会跟着去掉（只取并集的话，一台取消了收藏，另一台合并回来又加上了）
  const setOf = (ids) => Object.fromEntries(ids.map((id) => [id, true]));
  const keepOrder = (old, m) => [...old.filter((id) => has(m, id)), ...Object.keys(m).filter((id) => !old.includes(id))];
  const splitKey = (k) => [k.slice(0, k.indexOf('/')), k.slice(k.indexOf('/') + 1)];
  const FLAT = [
    {
      tag: 'menu',
      label: '食谱里换过的菜',
      get: (s) => Object.fromEntries(Object.entries(s.meals.days).flatMap(([day, picks]) => Object.entries(picks).map(([slot, id]) => [`${day}/${slot}`, id]))),
      put: (s, m) => {
        s.meals.days = {};
        for (const [k, id] of Object.entries(m)) {
          const [day, slot] = splitKey(k);
          (s.meals.days[day] = s.meals.days[day] || {})[slot] = id;
        }
      },
    },
    {
      tag: 'bought',
      label: '买菜清单',
      get: (s) => setOf(Object.entries(s.meals.bought).flatMap(([day, names]) => names.map((n) => `${day}/${n}`))),
      put: (s, m) => {
        const old = s.meals.bought;
        s.meals.bought = {};
        for (const k of Object.keys(m)) {
          const [day, name] = splitKey(k);
          (s.meals.bought[day] = s.meals.bought[day] || []).push(name);
        }
        for (const day of Object.keys(s.meals.bought)) s.meals.bought[day] = keepOrder(old[day] || [], setOf(s.meals.bought[day]));
      },
    },
    { tag: 'fav', label: '收藏的菜', get: (s) => setOf(s.meals.favorites), put: (s, m) => { s.meals.favorites = keepOrder(s.meals.favorites, m); } },
    { tag: 'avoid', label: '忌口', get: (s) => setOf(s.meals.avoid), put: (s, m) => { s.meals.avoid = keepOrder(s.meals.avoid, m); } },
    { tag: 'story-fav', label: '收藏的故事', get: (s) => setOf(s.stories.favorites), put: (s, m) => { s.stories.favorites = keepOrder(s.stories.favorites, m); } },
    { tag: 'story-block', label: '不想听的故事', get: (s) => setOf(s.stories.blocked), put: (s, m) => { s.stories.blocked = keepOrder(s.stories.blocked, m); } },
  ];

  // 同一条记录刚记下时和存过一遍再读出来，字段的顺序、空着的字段可能不一样，指纹不能跟着变
  function canon(v) {
    if (Array.isArray(v)) return v.map(canon);
    if (!v || typeof v !== 'object') return v;
    const out = {};
    for (const k of Object.keys(v).sort()) {
      const x = v[k];
      const empty = x === null || x === undefined || x === '' || x === false
        || (Array.isArray(x) ? !x.length : typeof x === 'object' && !Object.keys(x).length);
      if (!empty) out[k] = canon(x);
    }
    return out;
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b) || JSON.stringify(canon(a)) === JSON.stringify(canon(b));

  /** 内容的指纹（FNV-1a，8 位十六进制） */
  function sign(item) {
    const s = JSON.stringify(canon(item));
    let h = 2166136261;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  // 多了先丢最早的
  function cap(store, max, when) {
    const keys = Object.keys(store);
    if (keys.length <= max) return;
    keys.sort((a, b) => (when(store[a]) < when(store[b]) ? -1 : when(store[a]) > when(store[b]) ? 1 : 0))
      .slice(0, keys.length - max).forEach((k) => delete store[k]);
  }

  /** 记下删掉了哪条 */
  function drop(store, key, item) {
    store[key] = { on: D.today(), sig: sign(item) };
    cap(store, KEEP_REMOVED, (v) => v.on);
  }

  /** 读存储和备份时清理删过的标记：格式不对的、半年以前的不要 */
  function clean(raw, today = D.today()) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    const since = D.addDays(today, -KEEP_DAYS);
    for (const [k, v] of Object.entries(raw)) {
      if (k.length <= 80 && v && D.isISODate(v.on) && v.on >= since && /^[0-9a-f]{8}$/.test(v.sig)) out[k] = { on: v.on, sig: v.sig };
    }
    return out;
  }

  /** 改过的时间也一样清理 */
  function cleanEdits(raw, now = Date.now()) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    const since = now - KEEP_DAYS * DAY;
    for (const [k, v] of Object.entries(raw)) if (k.length <= 80 && Number.isFinite(v) && v >= since && v <= now + DAY) out[k] = v;
    cap(out, KEEP_EDITS, (v) => v);
    return out;
  }

  // ---------- 记下改过的 ----------

  // 上次保存时每条的样子，按这份数据存，换了一份（导入、合并、重新开始）就重新起头
  const seen = new WeakMap();

  /**
   * 每组记录：编号 → 这条的文字。
   * full：新记的、删掉的也要记时间——按日期、按名字的两台可能各记一条同一个编号；随机编号的只记改过的，删掉的有「删过」的标记
   */
  function shapeOf(src, lists, maps, info) {
    const out = {};
    const text = (entries) => new Map(entries.map(([k, v]) => [k, JSON.stringify(v)]));
    for (const [tag, field, , key = byId] of lists) out[tag] = { full: key !== byId, each: text(src[field].map((x) => [String(key(x)), x])) };
    for (const [tag, field] of maps) out[tag] = { full: true, each: text(Object.entries(src[field])) };
    out.info = { full: true, each: text(Object.entries(info)) };
    return out;
  }
  function topShape(s) {
    const out = shapeOf(s, LISTS, [], { ...profileOf(s.profile), ...sharedPrefs(s.prefs) });
    for (const f of FLAT) out[f.tag] = { full: true, each: new Map(Object.entries(f.get(s)).map(([k, v]) => [k, JSON.stringify(v)])) };
    return out;
  }
  const babyShape = (b) => shapeOf(b, BABY_LISTS, BABY_MAPS, birthOf(b));

  function stamp(store, before, after, now) {
    for (const [tag, { full, each }] of Object.entries(after)) {
      const old = before[tag] ? before[tag].each : new Map();
      for (const [k, v] of each) {
        const was = old.get(k);
        if (was === v || (was === undefined && !full)) continue;
        if (was === undefined || !same(JSON.parse(was), JSON.parse(v))) store[`${tag}:${k}`] = now;
      }
      if (full) for (const k of old.keys()) if (!each.has(k)) store[`${tag}:${k}`] = now;
    }
    cap(store, KEEP_EDITS, (v) => v);
  }

  // 删过的标记只留真的不在了的：撤销删除以后这条又在了，标记就去掉。云同步不下载没变的文件，靠的就是这一点
  function clearStale(removed, shape) {
    for (const k of Object.keys(removed)) {
      const cut = k.indexOf(':');
      const group = shape[k.slice(0, cut)];
      if (group && group.each.has(k.slice(cut + 1))) delete removed[k];
    }
  }

  /** 读出来时先记一份底；之后每次保存，新记的、改过的、删掉的都记下这会儿的时间 */
  function track(state, now = Date.now()) {
    if (!state) return;
    const prev = seen.get(state);
    const top = topShape(state);
    const b = state.baby;
    const baby = b ? babyShape(b) : null;
    seen.set(state, { top, baby, b });
    clearStale(state.removed, top);
    if (b) clearStale(b.removed, baby);
    if (!prev) return;
    stamp(state.edits, prev.top, top, now);
    if (b) stamp(b.edits, prev.b === b ? prev.baby : {}, baby, now);
  }

  // ---------- 合并 ----------

  function union(a, b) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) if (!out[k] || out[k].on < v.on) out[k] = v;
    return out;
  }

  function unionEdits(a, b) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) if (!(out[k] >= v)) out[k] = v;
    return out;
  }

  // added 加了几条，updated 换成了对方后改的，dropped 跟着对方删的，kept 两边不一样、留了这台的；unit 是「条」还是「项」
  const tally = (stats, label, n, unit = '条') => {
    if (n.added || n.updated || n.dropped || n.kept) stats.push({ label, unit, ...n });
  };
  const counts = () => ({ added: 0, updated: 0, dropped: 0, kept: 0 });

  /** 两边都有、内容不一样：后改的那边算；都没记时间就交给 fill 补空着的，其余以这台为准。返回要不要换成对方的 */
  function pick(a, b, id, ctx, n, fill) {
    if (same(a, b)) return false;
    const mine = ctx.edits.mine[id] || 0;
    const theirs = ctx.edits.other[id] || 0;
    if (theirs > mine) {
      n.updated += 1;
      return true;
    }
    if (!mine && fill) fill(a, b);
    if (!same(a, b)) n.kept += 1;
    return false;
  }

  /**
   * 一种列表：对方删掉了、这边一模一样的那条删掉；对方有、这边没有的加进来，这边删过一模一样的就不加；
   * 两边都有的交给 pick
   */
  function list(mine, other, tag, label, key, ctx, fill) {
    const n = counts();
    const otherKeys = new Set(other.map(key));
    const out = mine.filter((x) => {
      const t = ctx.removed.other[`${tag}:${key(x)}`];
      if (t && !otherKeys.has(key(x)) && t.sig === sign(x)) {
        n.dropped += 1;
        return false;
      }
      return true;
    });
    const at = new Map(out.map((x, i) => [key(x), i]));
    for (const x of other) {
      const k = key(x);
      const id = `${tag}:${k}`;
      if (at.has(k)) {
        if (pick(out[at.get(k)], x, id, ctx, n, fill)) out[at.get(k)] = x;
        continue;
      }
      const t = ctx.removed.mine[id];
      if (t && t.sig === sign(x)) continue;
      at.set(k, out.length);
      out.push(x);
      n.added += 1;
    }
    tally(ctx.stats, label, n);
    return out;
  }

  /** { 编号: 值 } 这种：没有标记删过，靠改过的时间——只有一边有、另一边后来删了的，跟着删 */
  function map(mine, other, tag, label, ctx, fill) {
    const n = counts();
    for (const k of new Set([...Object.keys(mine), ...Object.keys(other)])) {
      const id = `${tag}:${k}`;
      const tMine = ctx.edits.mine[id] || 0;
      const tOther = ctx.edits.other[id] || 0;
      if (has(mine, k) && has(other, k)) {
        if (pick(mine[k], other[k], id, ctx, n, fill)) mine[k] = other[k];
      } else if (has(other, k)) {
        if (tMine > tOther) continue;
        mine[k] = other[k];
        n.added += 1;
      } else if (tOther > tMine) {
        delete mine[k];
        n.dropped += 1;
      }
    }
    tally(ctx.stats, label, n);
  }

  /**
   * 预产期、宝宝的名字这些一项一项比：后改的那边算；都没记时间的，这边空着就用那边的。
   * 返回换成对方的有哪几项
   */
  function fields(a, b, names, fillable, ctx) {
    const taken = [];
    for (const f of names) {
      if (same(a[f], b[f])) continue;
      const mine = ctx.edits.mine[`info:${f}`] || 0;
      const theirs = ctx.edits.other[`info:${f}`] || 0;
      const blank = (v) => v == null || v === '';
      if (theirs > mine || (!mine && !theirs && blank(a[f]) && !blank(b[f]) && fillable.includes(f))) {
        a[f] = b[f];
        taken.push(f);
      }
    }
    return taken;
  }

  // 没记改过的时间时：这边空着、那边有的补上
  const fillCheckup = (a, b) => {
    if (!a.date && b.date) Object.assign(a, { date: b.date, time: b.time });
    if (!a.done && b.done) a.done = true;
  };
  const fillDone = (a, b) => { if (!a.done && b.done) a.done = b.done; };
  const fillBooking = (a, b) => {
    fillDone(a, b);
    if (!a.booked && b.booked) a.booked = b.booked;
  };
  const fillEnd = (a, b) => { if (a.end == null && b.end != null) Object.assign(a, b); };
  const FILLS = { checkup: fillCheckup, bag: fillDone, kick: fillEnd, contraction: fillEnd, log: fillEnd, vaccine: fillBooking, exam: fillBooking };

  function mergeBaby(a, b, ctx) {
    const sub = { ...ctx, removed: { mine: a.removed, other: b.removed }, edits: { mine: a.edits, other: b.edits } };
    // 同一种计时只能有一个在走：这台正在计时的话，对方那边还没停的先不合
    const timing = (l) => (l.type === 'breast' || l.type === 'sleep') && l.end == null;
    const mineIds = new Set(a.logs.map((l) => l.id));
    const busy = new Set(a.logs.filter(timing).map((l) => l.type));
    const logs = b.logs.filter((l) => mineIds.has(l.id) || !timing(l) || !busy.has(l.type));
    if (logs.length < b.logs.length) ctx.notes.push('两边都有正在计时的喂奶或睡觉，对方那条先没合；都停了以后再合一次');

    const born = a.birthDate !== b.birthDate;
    const taken = fields(a, b, Object.keys(birthOf(a)), ['name', 'birthTime'], sub);
    tally(ctx.stats, '宝宝的出生信息', { ...counts(), updated: taken.length }, '项');
    if (born) ctx.notes.push(`两边宝宝的出生日期不一样，用的是${taken.includes('birthDate') ? '对方后来改的' : '这台手机上的'}`);

    for (const [tag, field, label, key = byId] of BABY_LISTS) a[field] = list(a[field], tag === 'log' ? logs : b[field], tag, label, key, sub, FILLS[tag]);
    for (const [tag, field, label] of BABY_MAPS) map(a[field], b[field], tag, label, sub, FILLS[tag]);
    a.removed = union(a.removed, b.removed);
    a.edits = unionEdits(a.edits, b.edits);
  }

  /**
   * 把 other（另一台手机导出的，已经校验过）合进 mine，不改 mine：
   * 返回 { state 合好的, stats [{ label, unit, added, updated, dropped, kept }], notes 要说一声的, added, updated, dropped, kept }
   */
  function merge(mine, other) {
    const out = JSON.parse(JSON.stringify(mine));
    const theirs = JSON.parse(JSON.stringify(other));
    const ctx = { stats: [], notes: [], removed: { mine: out.removed, other: theirs.removed }, edits: { mine: out.edits, other: theirs.edits } };

    const due = out.profile.dueDate !== theirs.profile.dueDate;
    const taken = fields(out.profile, theirs.profile, Object.keys(profileOf(out.profile)), ['preWeight', 'height', 'nickname'], ctx);
    tally(ctx.stats, '预产期和资料', { ...counts(), updated: taken.length }, '项');
    if (due) ctx.notes.push(`两边的预产期不一样，用的是${taken.includes('dueDate') ? '对方后来改的' : '这台手机上的'}`);

    const prefs = fields(out.prefs, theirs.prefs, Object.keys(sharedPrefs(out.prefs)), [], ctx);
    tally(ctx.stats, '餐后测血糖的时间', { ...counts(), updated: prefs.length }, '项');

    for (const [tag, field, label, key = byId] of LISTS) out[field] = list(out[field], theirs[field], tag, label, key, ctx, FILLS[tag]);

    for (const f of FLAT) {
      const m = f.get(out);
      map(m, f.get(theirs), f.tag, f.label, ctx);
      f.put(out, m);
    }
    for (const [day, k] of Object.entries(theirs.pelvic.days)) if ((out.pelvic.days[day] || 0) < k) out.pelvic.days[day] = k;

    if (!out.baby && theirs.baby) {
      out.baby = theirs.baby;
      tally(ctx.stats, '宝宝的出生信息', { ...counts(), added: 1 });
      tally(ctx.stats, '宝宝的日常记录', { ...counts(), added: theirs.baby.logs.length });
    } else if (out.baby && theirs.baby) {
      mergeBaby(out.baby, theirs.baby, ctx);
    }
    out.removed = union(out.removed, theirs.removed);
    out.edits = unionEdits(out.edits, theirs.edits);

    const sum = (f) => ctx.stats.reduce((s, x) => s + x[f], 0);
    return {
      state: Baby.model.normalize(out),
      stats: ctx.stats,
      notes: ctx.notes,
      added: sum('added'),
      updated: sum('updated'),
      dropped: sum('dropped'),
      kept: sum('kept'),
    };
  }

  Baby.merge = { canon, sign, drop, clean, cleanEdits, track, merge };
})();
