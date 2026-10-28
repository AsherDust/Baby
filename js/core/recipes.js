(function () {
  'use strict';
  // 孕期和哺乳期食谱：按孕期阶段（宝宝出生后是哺乳期）、忌口和最近的血糖，每天配好三餐和加餐；
  // 换菜、收藏、买菜清单也在这里。
  // 食谱本身在 data/recipes.js，这里只管挑和记，不碰页面
  const Baby = globalThis.Baby || (globalThis.Baby = {});
  const D = Baby.dates;

  const KINDS = [
    { id: 'breakfast', name: '早餐' },
    { id: 'main', name: '主菜' },
    { id: 'veg', name: '蔬菜' },
    { id: 'soup', name: '汤' },
    { id: 'snack', name: '加餐' },
  ];
  // 每顿有哪几格：[格子, 放哪类菜, 只在哪个阶段有]。哺乳期每餐都要有汤水，一天五六顿，所以多一碗午餐的汤和一顿睡前加餐
  const MEALS = [
    { id: 'breakfast', name: '早餐', slots: [['breakfast', 'breakfast']] },
    { id: 'lunch', name: '午餐', staple: true, slots: [['lunch-main', 'main'], ['lunch-veg', 'veg'], ['lunch-soup', 'soup', 'nursing']] },
    { id: 'snack', name: '加餐', slots: [['snack', 'snack']] },
    { id: 'dinner', name: '晚餐', staple: true, slots: [['dinner-main', 'main'], ['dinner-veg', 'veg'], ['dinner-soup', 'soup']] },
    { id: 'night', name: '睡前加餐', slots: [['night-snack', 'snack', 'nursing']] },
  ];
  const SLOTS = MEALS.flatMap((m) => m.slots.map(([key, kind, only]) => ({ key, kind, meal: m.id, only: only || '' })));
  const TAGS = [
    { id: 'iron', name: '补铁' },
    { id: 'calcium', name: '补钙' },
    { id: 'protein', name: '优质蛋白' },
    { id: 'folate', name: '叶酸' },
    { id: 'dha', name: 'DHA' },
    { id: 'iodine', name: '补碘' },
    { id: 'fiber', name: '膳食纤维' },
  ];
  const AVOIDS = [
    { id: 'seafood', name: '鱼虾' },
    { id: 'poultry', name: '鸡鸭' },
    { id: 'pork', name: '猪肉' },
    { id: 'beef-lamb', name: '牛羊肉' },
    { id: 'organ', name: '内脏和血' },
    { id: 'egg', name: '鸡蛋' },
    { id: 'milk', name: '奶制品' },
    { id: 'nuts', name: '坚果' },
    { id: 'spicy', name: '辣' },
  ];
  const SHOP_GROUPS = [
    { id: 'veg', name: '蔬菜菌菇' },
    { id: 'fruit', name: '水果' },
    { id: 'meat', name: '肉禽' },
    { id: 'fish', name: '鱼虾' },
    { id: 'dairy', name: '蛋奶豆制品' },
    { id: 'grain', name: '主食杂粮' },
    { id: 'dry', name: '干货坚果' },
  ];
  const STAGES = ['early', 'mid', 'late', 'nursing'];
  // 现在看哪一顿：10 点前早餐，14 点前午餐，17 点前加餐，21 点前晚餐，再晚就看明天早餐；哺乳期 20 点后是睡前加餐
  const MEAL_UNTIL = {
    pregnant: [['breakfast', 10], ['lunch', 14], ['snack', 17], ['dinner', 21]],
    nursing: [['breakfast', 10], ['lunch', 14], ['snack', 17], ['dinner', 20], ['night', 23]],
  };
  // 按天轮换从这天数起
  const DAY0 = '2026-01-01';
  const KEEP_DAYS = 14;
  const LIST_MAX = 300;
  const NAME_MAX = 20;
  const ID = /^[a-z0-9-]{2,30}$/;

  const isId = (v) => typeof v === 'string' && ID.test(v);
  const idList = (list) => [...new Set(Array.isArray(list) ? list.filter(isId) : [])].slice(-LIST_MAX);
  const slotOf = (key) => SLOTS.find((s) => s.key === key) || null;
  /** 这个阶段一天有哪几格 */
  const slotsOf = (ctx) => SLOTS.filter((s) => !s.only || s.only === ctx.stage);
  const perDay = (kind, ctx) => slotsOf(ctx).filter((s) => s.kind === kind).length;
  const mod = (n, m) => ((n % m) + m) % m;

  function empty() {
    return { days: {}, favorites: [], avoid: [], bought: {} };
  }

  /** 按日期记的只留最近几天，免得越存越多 */
  function recent(byDate) {
    return Object.fromEntries(Object.entries(byDate).sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, KEEP_DAYS));
  }

  function normalize(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const days = {};
    if (r.days && typeof r.days === 'object') {
      for (const [date, picks] of Object.entries(r.days)) {
        if (!D.isISODate(date) || !picks || typeof picks !== 'object') continue;
        const clean = {};
        for (const [key, id] of Object.entries(picks)) if (slotOf(key) && isId(id)) clean[key] = id;
        if (Object.keys(clean).length) days[date] = clean;
      }
    }
    const bought = {};
    if (r.bought && typeof r.bought === 'object') {
      for (const [date, names] of Object.entries(r.bought)) {
        if (!D.isISODate(date) || !Array.isArray(names)) continue;
        const clean = [...new Set(names.filter((n) => typeof n === 'string' && n && n.length <= NAME_MAX))].slice(0, 100);
        if (clean.length) bought[date] = clean;
      }
    }
    const avoid = Array.isArray(r.avoid) ? r.avoid : [];
    return {
      days: recent(days),
      favorites: idList(r.favorites),
      avoid: AVOIDS.map((a) => a.id).filter((id) => avoid.includes(id)),
      bought: recent(bought),
    };
  }

  /** 孕早期 early（<14 周）/ 孕中期 mid / 孕晚期 late（≥28 周） */
  const stageOf = (gaDays) => STAGES[D.trimester(gaDays) - 1];

  const find = (book, id) => book.recipes.find((r) => r.id === id) || null;

  const avoidCache = new WeakMap();
  /** 这道菜碰到哪些忌口：看用料和调料在 pantry 里登记的类别 */
  function avoidsOf(book, recipe) {
    if (!avoidCache.has(recipe)) {
      const hit = new Set();
      for (const name of [...recipe.items.map((i) => i[0]), ...recipe.season]) (book.pantry[name] || []).slice(1).forEach((a) => hit.add(a));
      avoidCache.set(recipe, hit);
    }
    return avoidCache.get(recipe);
  }

  function fits(book, recipe, st, stage) {
    if (recipe.stages && !recipe.stages.includes(stage)) return false;
    const hit = avoidsOf(book, recipe);
    return !st.avoid.some((a) => hit.has(a));
  }

  /** 主菜的格子在忌口太多、主菜不够时，也收有蛋白质的蔬菜（豆腐这类） */
  const accepts = (kind, r) => r.kind === kind || (kind === 'main' && r.kind === 'veg' && r.good.includes('protein'));

  /** 某一类里能挑的：按阶段和忌口筛；最近血糖偏高、控糖的又够用时只要控糖的 */
  function pool(book, st, kind, ctx) {
    const of = (k) => book.recipes.filter((r) => r.kind === k && fits(book, r, st, ctx.stage));
    let list = of(kind);
    if (kind === 'main' && list.length < perDay(kind, ctx)) list = list.concat(of('veg').filter((r) => accepts('main', r)));
    if (ctx.sugar) {
      const calm = list.filter((r) => r.gdm);
      if (calm.length >= perDay(kind, ctx)) list = calm;
    }
    return list;
  }

  /** 同一个字符串总得到同一个数，用来按日期「随机」排 */
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function shuffled(list, kind, cycle) {
    const key = (r) => hash(`${kind}/${cycle}/${r.id}`);
    return list.slice().sort((a, b) => key(a) - key(b) || (a.id < b.id ? -1 : 1));
  }

  /**
   * 同一类的菜按天往后轮，一轮里每道各出现一次，下一轮换个顺序。
   * 一天有几格时，换轮那天可能半天在上一轮、半天在新一轮，所以新一轮开头要避开
   * 上一轮结尾 2×per−1 个（前一天可能吃过的），免得连着两天一样。
   * nth：这一类在一天里的第几格（午餐主菜 0、晚餐主菜 1），per：这一类一天几格
   */
  function turn(list, kind, date, nth, per) {
    const p = D.diffDays(DAY0, date) * per + nth;
    const cycle = Math.floor(p / list.length);
    return { order: cycleOrder(list, kind, cycle, 2 * per - 1), index: p - cycle * list.length };
  }

  const orderCache = new Map();
  /**
   * 第 cycle 轮的顺序：开头 span 个从上一轮结尾 span 个以外的里面挑，其余照打乱的顺序。
   * 下一轮比的是这一轮排好以后的结尾，所以从第 0 轮一轮一轮往后推，推过的记下来
   */
  function cycleOrder(list, kind, cycle, span) {
    if (cycle <= 0 || list.length < 2 * span) return shuffled(list, kind, cycle);
    const key = `${kind}/${span}/${list.map((r) => r.id).join(',')}`;
    let memo = orderCache.get(key);
    if (!memo) {
      memo = [shuffled(list, kind, 0)];
      orderCache.set(key, memo);
      if (orderCache.size > 60) orderCache.delete(orderCache.keys().next().value);
    }
    for (let c = memo.length; c <= cycle; c += 1) {
      const last = new Set(memo[c - 1].slice(-span));
      const order = shuffled(list, kind, c);
      const head = order.filter((r) => !last.has(r)).slice(0, span);
      memo.push([...head, ...order.filter((r) => !head.includes(r))]);
    }
    return memo[cycle];
  }

  const nthOf = (slot, ctx) => slotsOf(ctx).filter((s) => s.kind === slot.kind).indexOf(slot);
  /** 主菜先挑：忌口太多时主菜要借用豆腐这类蔬菜，别让蔬菜的格子先拿走 */
  const fillOrder = (ctx) => [...slotsOf(ctx).filter((s) => s.kind === 'main'), ...slotsOf(ctx).filter((s) => s.kind !== 'main')];

  function stapleOf(book, date, meal, sugar) {
    const list = book.staples.filter(([, , calm]) => !sugar || calm);
    const [name, note] = list[mod(D.diffDays(DAY0, date) * 2 + (meal === 'dinner' ? 1 : 0), list.length)];
    return { name, note };
  }

  /**
   * 某天的菜单：换过的、自己放进来的先占好格子，其余按日期轮，同一天不重样。
   * 返回 [{ meal, name, staple, dishes: [{ key, kind, recipe }] }]；忌口太多挑不出来时 recipe 是 null
   */
  function menu(book, st, date, ctx) {
    const pinned = st.days[date] || {};
    const used = new Set();
    const chosen = {};
    const slots = slotsOf(ctx);
    for (const s of slots) {
      const r = find(book, pinned[s.key]);
      if (r && accepts(s.kind, r) && fits(book, r, st, ctx.stage) && !used.has(r.id)) {
        chosen[s.key] = r;
        used.add(r.id);
      }
    }
    for (const s of fillOrder(ctx)) {
      if (chosen[s.key]) continue;
      chosen[s.key] = null;
      const list = pool(book, st, s.kind, ctx);
      if (!list.length) continue;
      const { order, index } = turn(list, s.kind, date, nthOf(s, ctx), perDay(s.kind, ctx));
      const r = order.map((_, i) => order[(index + i) % order.length]).find((x) => !used.has(x.id));
      if (r) {
        chosen[s.key] = r;
        used.add(r.id);
      }
    }
    const keys = new Set(slots.map((s) => s.key));
    return MEALS.map((m) => ({
      meal: m.id,
      name: m.name,
      staple: m.staple ? stapleOf(book, date, m.id, ctx.sugar) : null,
      dishes: m.slots.filter(([key]) => keys.has(key)).map(([key, kind]) => ({ key, kind, recipe: chosen[key] })),
    })).filter((m) => m.dishes.length);
  }

  const dishesOf = (meals) => meals.flatMap((m) => m.dishes);

  function pin(st, date, key, id) {
    st.days[date] = { ...(st.days[date] || {}), [key]: id };
    st.days = recent(st.days);
  }

  /** 换一道：顺着这一格的轮换顺序往后找，同一天别的格子正用着的跳过；没得换时返回 null */
  function swap(book, st, date, key, ctx) {
    const slot = slotsOf(ctx).find((s) => s.key === key);
    if (!slot) return null;
    const dishes = dishesOf(menu(book, st, date, ctx));
    const current = dishes.find((x) => x.key === key).recipe;
    const others = new Set(dishes.filter((x) => x.key !== key && x.recipe).map((x) => x.recipe.id));
    const list = pool(book, st, slot.kind, ctx);
    if (!list.length) return null;
    const { order, index } = turn(list, slot.kind, date, nthOf(slot, ctx), perDay(slot.kind, ctx));
    const at = order.indexOf(current);
    const from = at >= 0 ? at : index - 1;
    for (let i = 1; i <= order.length; i += 1) {
      const r = order[mod(from + i, order.length)];
      if (r !== current && !others.has(r.id)) {
        pin(st, date, key, r.id);
        return r;
      }
    }
    return null;
  }

  /** 这类菜在这个阶段能放进哪几格 */
  const slotsFor = (kind, ctx = { stage: '' }) => slotsOf(ctx).filter((s) => s.kind === kind);

  /** 从全部食谱里挑一道放进某一格；同一天别的格子里也放了这道的，那一格让出来重新轮 */
  function place(book, st, date, key, id) {
    const slot = slotOf(key);
    const r = find(book, id);
    if (!slot || !r || r.kind !== slot.kind) return null;
    const day = { ...(st.days[date] || {}) };
    for (const [k, v] of Object.entries(day)) if (v === id) delete day[k];
    day[key] = id;
    st.days[date] = day;
    st.days = recent(st.days);
    return r;
  }

  function toggleFavorite(st, id) {
    const i = st.favorites.indexOf(id);
    if (i >= 0) st.favorites.splice(i, 1);
    else st.favorites.push(id);
    return i < 0;
  }

  function toggleAvoid(st, id) {
    if (!AVOIDS.some((a) => a.id === id)) return false;
    const on = !st.avoid.includes(id);
    st.avoid = AVOIDS.map((a) => a.id).filter((x) => (x === id ? on : st.avoid.includes(x)));
    return on;
  }

  /** 菜名前小圆点左右两半的颜色：两样主要食材的颜色，只找到一样时整颗一个颜色。辅食也用这个，它没有 season */
  function dotOf(colors, recipe) {
    const names = recipe.dot || [...recipe.items.map((i) => i[0]), ...(recipe.season || [])];
    const found = names.map((n) => colors[n]).filter(Boolean);
    return [found[0], found[1] || found[0]];
  }

  /** 菜单里补到了哪些营养 */
  function coverage(meals) {
    const has = new Set(dishesOf(meals).flatMap((x) => (x.recipe ? x.recipe.good : [])));
    return TAGS.filter((t) => has.has(t.id));
  }

  /** 2 → "2 个"，0.5 → "半根" */
  function amount(qty, unit) {
    if (qty === 0.5) return `半${unit}`;
    return `${Math.round(qty * 10) / 10} ${unit}`;
  }

  /** 食谱里的一样用料：「鲈鱼 1 条（约 500 克）」 */
  const itemText = ([, qty, unit, note]) => `${amount(qty, unit)}${note ? `（${note}）` : ''}`;

  /**
   * 买菜清单：这天菜单里的用料按名字合起来，同样的单位数量相加，按买菜的分组排好。
   * 调料和葱姜蒜单列，家里一般都有
   */
  function shopping(book, meals, st, date) {
    const items = new Map();
    const season = new Set();
    for (const { recipe } of dishesOf(meals)) {
      if (!recipe) continue;
      for (const [name, qty, unit, note] of recipe.items) {
        if (!items.has(name)) items.set(name, { name, group: book.pantry[name][0], parts: new Map(), notes: [], dishes: [] });
        const it = items.get(name);
        it.parts.set(unit, (it.parts.get(unit) || 0) + qty);
        if (note) it.notes.push(note);
        it.dishes.push(recipe.name);
      }
      recipe.season.forEach((s) => season.add(s));
    }
    const bought = new Set(st.bought[date] || []);
    const groups = SHOP_GROUPS.map((g) => ({
      ...g,
      items: [...items.values()].filter((it) => it.group === g.id).map((it) => ({
        name: it.name,
        amount: [...it.parts].map(([unit, qty]) => amount(qty, unit)).join(' + ') + (it.dishes.length === 1 && it.notes.length ? `（${it.notes[0]}）` : ''),
        dishes: it.dishes,
        bought: bought.has(it.name),
      })),
    })).filter((g) => g.items.length);
    const all = groups.flatMap((g) => g.items);
    return { groups, season: [...season], total: all.length, done: all.filter((i) => i.bought).length };
  }

  function toggleBought(st, date, name) {
    const list = st.bought[date] || [];
    const on = !list.includes(name);
    const next = on ? [...list, name] : list.filter((n) => n !== name);
    if (next.length) st.bought[date] = next;
    else delete st.bought[date];
    st.bought = recent(st.bought);
    return on;
  }

  /** 发给家人的文字：只列还没买的 */
  function shoppingText(list, title) {
    const lines = [title];
    for (const g of list.groups) {
      const left = g.items.filter((i) => !i.bought);
      if (left.length) lines.push(`${g.name}：${left.map((i) => `${i.name} ${i.amount}`).join('、')}`);
    }
    if (list.season.length) lines.push(`调料（家里没有的再买）：${list.season.join('、')}`);
    return lines.join('\n');
  }

  /**
   * 全部食谱：按类别、营养、收藏、控糖、清淡和关键词筛。
   * 碰到忌口、这个阶段先不吃的不列出来，另外数一下藏了几道
   */
  function library(book, st, stage, { kind = 'all', tag = '', only = '', query = '' } = {}) {
    const q = String(query).trim().toLowerCase();
    let hidden = 0;
    const list = book.recipes.filter((r) => {
      if (kind !== 'all' && r.kind !== kind) return false;
      if (tag && !r.good.includes(tag)) return false;
      if (only === 'favorites' && !st.favorites.includes(r.id)) return false;
      if (only === 'gdm' && !r.gdm) return false;
      if (only === 'light' && !r.light) return false;
      if (q && !r.name.toLowerCase().includes(q) && !r.items.some(([name]) => name.includes(q))) return false;
      if (!fits(book, r, st, stage)) {
        hidden += 1;
        return false;
      }
      return true;
    });
    return { list, hidden };
  }

  /** 现在该看哪一顿：{ meal, tomorrow } */
  function nextMeal(hour, stage = '') {
    const hit = MEAL_UNTIL[stage === 'nursing' ? 'nursing' : 'pregnant'].find(([, until]) => hour < until);
    return hit ? { meal: hit[0], tomorrow: false } : { meal: 'breakfast', tomorrow: true };
  }

  Baby.recipes = {
    KINDS,
    MEALS,
    SLOTS,
    STAGES,
    TAGS,
    AVOIDS,
    SHOP_GROUPS,
    empty,
    normalize,
    stageOf,
    find,
    avoidsOf,
    fits,
    menu,
    swap,
    slotsFor,
    place,
    toggleFavorite,
    toggleAvoid,
    dotOf,
    coverage,
    itemText,
    shopping,
    toggleBought,
    shoppingText,
    library,
    nextMeal,
  };
})();
