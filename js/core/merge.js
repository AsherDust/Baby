(function () {
  'use strict';
  // 两台手机合并记录：把对方有、这台没有的加进来；两边都有、内容不一样的同一条，取后改的那边。
  // 每次保存时比一比哪些记录变了，记下「什么时候改的」（edits）；分不出先后（以前的版本记的）时以这台为准。
  // 删掉的记录留一个「删过」的标记（编号 + 内容的指纹，removed）。合并时，另一台上一模一样的那条也删掉，免得删了又回来；
  // 标记只在这一边确实没有这条时才算数，撤销删除后自然就不作数了
  const Baby = globalThis.Baby || (globalThis.Baby = {});
  const D = Baby.dates;
  const { msg } = Baby.i18n;

  const KEEP_DAYS = 180;
  const KEEP_REMOVED = 500;
  const KEEP_EDITS = 3000;
  const DAY = 24 * 3600 * 1000;

  const byId = (x) => x.id;
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  /**
   * 每样数据在两台手机之间怎么办，只在这里定，别处都从这张表推出来：
   *   list    一条条的记录，按编号合（下面 LISTS、BABY_LISTS 写编号怎么取）
   *   map     { 编号: 值 }，按改的时间合（BABY_MAPS）
   *   flat    藏在别的结构里的集合、对照表，拍平了按 map 合（FLAT）
   *   field   单个值，按改的时间
   *   max     每天的次数，取多的
   *   meta    合并自己要用的：版本、删过的标记、改过的时间
   *   device  每台设备自己的：不上传，合并时留本机的，新手机从云端恢复时用初始值
   * 加了新字段要在这里写上。没写的照样上传、新手机恢复时也带着，只是两台手机合并时不知道怎么合，留本机的；
   * 单元测试会查有没有漏写、和下面的合法对不对得上
   */
  const SCHEMA = {
    version: 'meta',
    profile: { dueDate: 'field', preWeight: 'field', height: 'field', nickname: 'field' },
    prefs: { glucoseAfter: 'field', since: 'device', lastBackup: 'device', backupNudged: 'device', installHintHidden: 'device', storyCardHidden: 'device', moodCareHidden: 'device' },
    weights: 'list',
    checkups: 'list',
    bag: 'list',
    meds: 'list',
    kicks: 'list',
    contractions: 'list',
    bp: 'list',
    glucose: 'list',
    ultrasounds: 'list',
    stories: { tonight: 'device', done: 'device', favorites: 'flat', blocked: 'flat', lang: 'device', rate: 'device', voices: 'device', big: 'device' },
    journal: 'list',
    meals: { days: 'flat', favorites: 'flat', avoid: 'flat', bought: 'flat' },
    pelvic: { hold: 'field', days: 'max' },
    baby: {
      name: 'field', sex: 'field', birthDate: 'field', birthTime: 'field',
      logs: 'list', growth: 'list', moments: 'list', extraVaccines: 'list', stash: 'list',
      vaccines: 'map', exams: 'map', papers: 'map', milestones: 'map', teeth: 'map', tried: 'map', foodNotes: 'map',
      removed: 'meta', edits: 'meta',
    },
    removed: 'meta',
    edits: 'meta',
    notified: 'device',
  };
  const pickKeys = (o, keys) => Object.fromEntries(keys.map((k) => [k, (o || {})[k]]));
  const fieldsOf = (group) => Object.keys(SCHEMA[group]).filter((k) => SCHEMA[group][k] === 'field');

  /** 去掉每台设备自己的东西，剩下的才上传、才算「变没变」；表里没写的照样上传 */
  function shareable(state) {
    const walk = (v, schema) => {
      const out = {};
      for (const k of Object.keys(v)) {
        const policy = schema[k];
        if (policy === 'device') continue;
        out[k] = policy && typeof policy === 'object' && v[k] && typeof v[k] === 'object' ? walk(v[k], policy) : v[k];
      }
      return out;
    };
    return walk(state, SCHEMA);
  }

  /** 每台设备自己的东西换成 fresh 里的（新手机从云端恢复时用这台的初始值） */
  function withDevice(state, fresh) {
    const walk = (v, f, schema) => {
      const out = { ...v };
      for (const [k, policy] of Object.entries(schema)) {
        if (policy === 'device') out[k] = f[k];
        else if (typeof policy === 'object' && out[k] && f[k]) out[k] = walk(out[k], f[k], policy);
      }
      return out;
    };
    return walk(state, fresh, SCHEMA);
  }

  // 每样记录的编号、放在哪、每条的编号怎么取；记「改过」、记「删过」、合并都按这张表。
  // 合并预览里叫什么在词典里（merge.what.编号）
  const LISTS = [
    ['weight', 'weights', (w) => w.date],
    ['bp', 'bp'],
    ['glucose', 'glucose', (g) => `${g.date}/${g.slot}`],
    ['med', 'meds'],
    ['us', 'ultrasounds'],
    ['journal', 'journal'],
    ['kick', 'kicks'],
    ['contraction', 'contractions'],
    ['checkup', 'checkups'],
    ['bag', 'bag'],
  ];
  const BABY_LISTS = [
    ['log', 'logs'],
    ['growth', 'growth', (g) => g.date],
    ['moment', 'moments'],
    ['xv', 'extraVaccines'],
    ['stash', 'stash'],
  ];
  const BABY_MAPS = [
    ['vaccine', 'vaccines'],
    ['exam', 'exams'],
    ['paper', 'papers'],
    ['milestone', 'milestones'],
    ['tooth', 'teeth'],
    ['tried', 'tried'],
    ['food', 'foodNotes'],
  ];
  // 按改的时间一项一项合的单个值：顶层这几组共用一套「改过的时间」，宝宝的在宝宝那份里
  const FIELD_GROUPS = ['profile', 'prefs', 'pelvic'];
  const topFields = (s) => Object.assign({}, ...FIELD_GROUPS.map((g) => pickKeys(s[g], fieldsOf(g))));
  const birthOf = (b) => pickKeys(b, fieldsOf('baby'));

  // 藏在别的结构里、两台手机要同步的几样：拍平成 { 编号: 值 }，记改过的时间、合并都和疫苗那些一样，
  // 去掉的也会跟着去掉（只取并集的话，一台取消了收藏，另一台合并回来又加上了）
  const setOf = (ids) => Object.fromEntries(ids.map((id) => [id, true]));
  const keepOrder = (old, m) => [...old.filter((id) => has(m, id)), ...Object.keys(m).filter((id) => !old.includes(id))];
  const splitKey = (k) => [k.slice(0, k.indexOf('/')), k.slice(k.indexOf('/') + 1)];
  const FLAT = [
    {
      path: 'meals.days',
      tag: 'menu',
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
      path: 'meals.bought',
      tag: 'bought',
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
    { path: 'meals.favorites', tag: 'fav', get: (s) => setOf(s.meals.favorites), put: (s, m) => { s.meals.favorites = keepOrder(s.meals.favorites, m); } },
    { path: 'meals.avoid', tag: 'avoid', get: (s) => setOf(s.meals.avoid), put: (s, m) => { s.meals.avoid = keepOrder(s.meals.avoid, m); } },
    { path: 'stories.favorites', tag: 'story-fav', get: (s) => setOf(s.stories.favorites), put: (s, m) => { s.stories.favorites = keepOrder(s.stories.favorites, m); } },
    { path: 'stories.blocked', tag: 'story-block', get: (s) => setOf(s.stories.blocked), put: (s, m) => { s.stories.blocked = keepOrder(s.stories.blocked, m); } },
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
  function drop(store, key, item, now = Date.now()) {
    store[key] = { on: D.localISO(new Date(now)), at: now, sig: sign(item) };
    cap(store, KEEP_REMOVED, (v) => v.on);
  }

  // 删的时间；以前的标记只记了哪天，按那天一早算（撤销、重记在同一天的话，算后来的）
  const removedAt = (t) => (Number.isFinite(t.at) ? t.at : new Date(`${t.on}T00:00:00`).getTime());

  // 删过的标记是不是这一条：内置的产检、待产包按只留编号和用户改的样子签的也认，说明文字换了说法、换了语言也对得上
  const SLIM = { checkup: (x) => Baby.content.slimCheckup(x), bag: (x) => Baby.content.slimBagItem(x) };
  const signedAs = (t, tag, x) => t.sig === sign(x) || (tag in SLIM && t.sig === sign(SLIM[tag](x)));

  /** 读存储和备份时清理删过的标记：格式不对的、半年以前的不要 */
  function clean(raw, today = D.today()) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    const since = D.addDays(today, -KEEP_DAYS);
    for (const [k, v] of Object.entries(raw)) {
      if (k.length <= 80 && v && D.isISODate(v.on) && v.on >= since && /^[0-9a-f]{8}$/.test(v.sig)) {
        out[k] = { on: v.on, sig: v.sig, ...(Number.isFinite(v.at) ? { at: v.at } : {}) };
      }
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
    for (const [tag, field, key = byId] of lists) out[tag] = { full: key !== byId, each: text(src[field].map((x) => [String(key(x)), x])) };
    for (const [tag, field] of maps) out[tag] = { full: true, each: text(Object.entries(src[field])) };
    out.info = { full: true, each: text(Object.entries(info)) };
    return out;
  }
  function topShape(s) {
    const out = shapeOf(s, LISTS, [], topFields(s));
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

  // 删过的标记只留真的不在了的：撤销删除、原样重记以后这条又在了，标记去掉，再记下这会儿算改过——
  // 另一台手机上还有删的时候留的标记，比这个时间早，就不会把它又删掉。云同步不下载没变的文件，也靠这一点
  function clearStale(removed, shape, edits, now) {
    for (const k of Object.keys(removed)) {
      const cut = k.indexOf(':');
      const group = shape[k.slice(0, cut)];
      if (!group || !group.each.has(k.slice(cut + 1))) continue;
      delete removed[k];
      edits[k] = Math.max(edits[k] || 0, now);
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
    clearStale(state.removed, top, state.edits, now);
    if (b) clearStale(b.removed, baby, b.edits, now);
    if (!prev) return;
    stamp(state.edits, prev.top, top, now);
    if (b) stamp(b.edits, prev.b === b ? prev.baby : {}, baby, now);
  }

  // ---------- 合并 ----------

  function union(a, b) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) if (!out[k] || removedAt(out[k]) < removedAt(v)) out[k] = v;
    return out;
  }

  function unionEdits(a, b) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) if (!(out[k] >= v)) out[k] = v;
    return out;
  }

  // tag 是哪样东西（词典里 merge.what.编号）；added 加了几条，updated 换成了对方后改的，dropped 跟着对方删的，
  // kept 两边不一样、留了这台的；unit：entry 一条条的记录，item 一个个的设置，copy 整个宝宝的记录
  const tally = (stats, tag, n, unit = 'entry') => {
    if (n.added || n.updated || n.dropped || n.kept) stats.push({ tag, unit, ...n });
  };
  const counts = () => ({ added: 0, updated: 0, dropped: 0, kept: 0 });

  // 云同步时分不出先后的：两台按同一个规则选（比内容），不然各留各的，每次同步都来回提交
  const firstOf = (a, b) => JSON.stringify(canon(b)) < JSON.stringify(canon(a));

  /**
   * 两边都有、内容不一样：后改的那边算；分不出先后时，云同步两台选同一个，
   * 合并家人的文件交给 fill 补空着的、其余以这台为准。返回要不要换成对方的
   */
  function pick(a, b, id, ctx, n, fill) {
    if (same(a, b)) return false;
    const mine = ctx.edits.mine[id] || 0;
    const theirs = ctx.edits.other[id] || 0;
    if (theirs > mine || (theirs === mine && ctx.converge && firstOf(a, b))) {
      n.updated += 1;
      return true;
    }
    if (theirs === mine && ctx.converge) {
      n.kept += 1;
      return false;
    }
    if (!mine && fill) fill(a, b);
    if (!same(a, b)) n.kept += 1;
    return false;
  }

  /**
   * 一种列表：对方删掉了、这边一模一样的那条删掉；对方有、这边没有的加进来，这边删过一模一样的就不加；
   * 两边都有的交给 pick
   */
  function list(mine, other, tag, key, ctx, fill) {
    const n = counts();
    const otherKeys = new Set(other.map(key));
    const out = mine.filter((x) => {
      const id = `${tag}:${key(x)}`;
      const t = ctx.removed.other[id];
      if (t && !otherKeys.has(key(x)) && signedAs(t, tag, x) && removedAt(t) > (ctx.edits.mine[id] || 0)) {
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
      if (t && signedAs(t, tag, x) && removedAt(t) > (ctx.edits.other[id] || 0)) continue;
      at.set(k, out.length);
      out.push(x);
      n.added += 1;
    }
    tally(ctx.stats, tag, n);
    return out;
  }

  /** { 编号: 值 } 这种：没有标记删过，靠改过的时间——只有一边有、另一边后来删了的，跟着删 */
  function map(mine, other, tag, ctx, fill) {
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
    tally(ctx.stats, tag, n);
  }

  /**
   * 预产期、宝宝的名字这些一项一项比：后改的那边算。分不出先后的，这边空着就用那边的；
   * 云同步时两边都填了、又不一样，两台选同一个。返回换成对方的有哪几项
   */
  function fields(a, b, names, fillable, ctx) {
    const taken = [];
    const blank = (v) => v == null || v === '';
    for (const f of names) {
      if (same(a[f], b[f])) continue;
      const mine = ctx.edits.mine[`info:${f}`] || 0;
      const theirs = ctx.edits.other[`info:${f}`] || 0;
      const tie = mine === theirs;
      const fill = tie && blank(a[f]) && !blank(b[f]) && (ctx.converge || fillable.includes(f));
      const settle = tie && ctx.converge && !blank(a[f]) && !blank(b[f]) && firstOf(a[f], b[f]);
      if (theirs > mine || fill || settle) {
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
    if (logs.length < b.logs.length) ctx.notes.push(msg('merge.note.timing'));

    const born = a.birthDate !== b.birthDate;
    const taken = fields(a, b, Object.keys(birthOf(a)), ['name', 'birthTime'], sub);
    tally(ctx.stats, 'birth', { ...counts(), updated: taken.length }, 'item');
    if (born) ctx.notes.push(msg(taken.includes('birthDate') ? 'merge.note.birthTheirs' : 'merge.note.birthMine'));

    for (const [tag, field, key = byId] of BABY_LISTS) a[field] = list(a[field], tag === 'log' ? logs : b[field], tag, key, sub, FILLS[tag]);
    for (const [tag, field] of BABY_MAPS) map(a[field], b[field], tag, sub, FILLS[tag]);
    a.removed = union(a.removed, b.removed);
    a.edits = unionEdits(a.edits, b.edits);
  }

  // 宝宝最近一次改动的时间（出生信息、每条记录改过的、撤销清除）：和另一台「清除宝宝」的时间比
  const babyTime = (s) => Math.max(s.edits['baby:restored'] || 0, ...Object.values(s.baby.edits), 0);

  /**
   * 把 other（另一台手机导出的，已经校验过）合进 mine，不改 mine。
   * converge：云同步用，分不出先后的两台选同一个，免得来回提交；合并家人的文件时分不出先后以这台为准。
   * 返回 { state 合好的, stats [{ tag, unit, added, updated, dropped, kept }], notes 要说一声的（msg）, added, updated, dropped, kept }
   */
  function merge(mine, other, { converge = false } = {}) {
    const out = JSON.parse(JSON.stringify(mine));
    const theirs = JSON.parse(JSON.stringify(other));
    const ctx = {
      converge, stats: [], notes: [], removed: { mine: out.removed, other: theirs.removed }, edits: { mine: out.edits, other: theirs.edits },
    };

    const due = out.profile.dueDate !== theirs.profile.dueDate;
    const taken = fields(out.profile, theirs.profile, fieldsOf('profile'), ['preWeight', 'height', 'nickname'], ctx);
    tally(ctx.stats, 'profile', { ...counts(), updated: taken.length }, 'item');
    if (due) ctx.notes.push(msg(taken.includes('dueDate') ? 'merge.note.dueTheirs' : 'merge.note.dueMine'));

    const prefs = fields(out.prefs, theirs.prefs, fieldsOf('prefs'), [], ctx);
    tally(ctx.stats, 'glucoseAfter', { ...counts(), updated: prefs.length }, 'item');
    const hold = fields(out.pelvic, theirs.pelvic, fieldsOf('pelvic'), [], ctx);
    tally(ctx.stats, 'pelvicHold', { ...counts(), updated: hold.length }, 'item');

    for (const [tag, field, key = byId] of LISTS) out[field] = list(out[field], theirs[field], tag, key, ctx, FILLS[tag]);

    for (const f of FLAT) {
      const m = f.get(out);
      map(m, f.get(theirs), f.tag, ctx);
      f.put(out, m);
    }
    for (const [day, k] of Object.entries(theirs.pelvic.days)) if ((out.pelvic.days[day] || 0) < k) out.pelvic.days[day] = k;

    // 一边清除了宝宝信息：另一边的宝宝是清除以前就有的，跟着清掉；清除以后又改过、撤销过的，留着
    const cleared = out.edits['baby:cleared'] || 0;
    if (!out.baby && theirs.baby && (!cleared || cleared < babyTime(theirs))) {
      out.baby = theirs.baby;
      tally(ctx.stats, 'birth', { ...counts(), added: 1 });
      tally(ctx.stats, 'log', { ...counts(), added: theirs.baby.logs.length });
    } else if (out.baby && !theirs.baby && (theirs.edits['baby:cleared'] || 0) > babyTime(out)) {
      out.baby = null;
      tally(ctx.stats, 'babyAll', { ...counts(), dropped: 1 }, 'copy');
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

  // 给单元测试查表和合法对不对得上
  const STRATEGIES = {
    list: LISTS.map((x) => x[1]),
    'baby.list': BABY_LISTS.map((x) => `baby.${x[1]}`),
    'baby.map': BABY_MAPS.map((x) => `baby.${x[1]}`),
    flat: FLAT.map((f) => f.path),
    max: ['pelvic.days'],
    field: [...FIELD_GROUPS, 'baby'],
  };

  Baby.merge = { SCHEMA, STRATEGIES, shareable, withDevice, canon, sign, drop, clean, cleanEdits, track, merge };
})();
