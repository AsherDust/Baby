(function () {
  'use strict';
  // 「孕期食谱」页（宝宝出生后是「哺乳食谱」）：今日菜单、全部食谱、买菜清单；首页「今天吃什么」和工具页那一格的文字也在这里
  const { dates: D, model: M, recipes: R, recipeBook: BOOK, baby: Bb, art: A, app } = globalThis.Baby;
  const { esc, ui, subName } = app;

  const VIEWS = [['', '今日菜单'], ['all', '全部食谱'], ['shop', '买菜清单']];
  const kindName = Object.fromEntries(R.KINDS.map((k) => [k.id, k.name]));
  const tagName = Object.fromEntries(R.TAGS.map((t) => [t.id, t.name]));

  const dayOf = (offset) => D.addDays(ui.today, offset);
  const dayLabel = (offset) => (offset ? '明天' : '今天');

  /** 这天按什么挑：孕期阶段（宝宝出生后是哺乳期），最近 7 天血糖偏高了几次 */
  function context(date) {
    const ga = D.gestation(app.state.profile.dueDate, date);
    const high = M.glucoseSummary(app.state, ui.today).high;
    const b = app.state.baby;
    return { stage: b ? 'nursing' : R.stageOf(ga.days), sugar: high > 0, high, ga, sinceBirth: b ? D.diffDays(b.birthDate, date) : null };
  }

  const menuOn = (date) => R.menu(BOOK, app.state.meals, date, context(date));
  const isFavorite = (id) => app.state.meals.favorites.includes(id);

  /** 菜名前的小圆点，左右两半是两样主要食材的颜色 */
  function recipeDot(r) {
    const [a, b] = R.dotOf(BOOK, r);
    return `<span class="dish-dot" style="--a:${a};--b:${b}" aria-hidden="true"></span>`;
  }

  /** 下一顿吃什么，首页和工具页用：{ label: '午餐' / '明天早餐', day, dishes: [{ key, recipe }] } */
  function upcoming(now) {
    const { meal, tomorrow } = R.nextMeal(new Date(now).getHours(), context(ui.today).stage);
    const day = tomorrow ? 1 : 0;
    const m = menuOn(dayOf(day)).find((x) => x.meal === meal);
    return { label: `${tomorrow ? '明天' : ''}${m.name}`, day, dishes: m.dishes.filter((x) => x.recipe) };
  }

  function recipeStatus(now) {
    const next = upcoming(now);
    const names = next.dishes.map((x) => x.recipe.name);
    return { text: names.length ? `${next.label}：${esc(names.join(' · '))}` : '配好一天的饭菜，不知道吃什么时看看' };
  }

  /** 首页：下一顿的几道菜，点菜名直接看做法 */
  function todoMeal(now) {
    const next = upcoming(now);
    if (!next.dishes.length) return '';
    return `
      <li class="todo-item">
        <span class="todo-icon">${A.icon.pot}</span>
        <div class="todo-body">
          <div class="todo-head">
            <p class="todo-title">${app.state.baby ? '妈妈' : ''}${next.label}吃什么</p>
            <a class="link" href="#/tools/recipes">看菜单</a>
          </div>
          <ul class="meal-chips">${next.dishes.map(({ key, recipe }) => `
            <li><button type="button" class="meal-chip" id="meal-${key}" data-action="open-recipe" data-id="${recipe.id}" data-key="${key}" data-day="${next.day}">${recipeDot(recipe)}${esc(recipe.name)}</button></li>`).join('')}
          </ul>
        </div>
      </li>`;
  }

  function viewRecipesTool(route) {
    const views = { '': viewMenu, all: viewLibrary, shop: viewShopping };
    return `
      <nav class="seg-tabs" aria-label="${subName('recipes')}">
        ${VIEWS.map(([id, name]) => `<a href="#/tools/recipes${id ? `/${id}` : ''}" class="seg-tab"${route.view === id ? ' aria-current="page"' : ''}>${name}</a>`).join('')}
      </nav>
      ${views[route.view]()}`;
  }

  function daySwitch() {
    return `
      <div class="recipe-days" role="group" aria-label="看哪天">
        ${[0, 1].map((n) => `<button type="button" class="chip" id="recipe-day-${n}" data-action="recipe-day" data-day="${n}" aria-pressed="${ui.recipeDay === n}">${dayLabel(n)} ${D.formatDate(dayOf(n))}</button>`).join('')}
      </div>`;
  }

  function favButton(r) {
    const on = isFavorite(r.id);
    return `<button type="button" class="icon-btn icon-btn-sm dish-fav" id="fav-${r.id}" data-action="recipe-fav" data-id="${r.id}" aria-pressed="${on}" aria-label="${on ? '取消收藏' : '收藏'}「${esc(r.name)}」" title="${on ? '取消收藏' : '收藏'}">${A.icon.heart}</button>`;
  }

  // ---------- 今日菜单 ----------

  /** 孕中期 · 24 周 / 坐月子 · 宝宝 5 天 / 哺乳期 · 宝宝 3 个月 */
  function stageTitle(ctx) {
    if (ctx.stage !== 'nursing') return `${D.TRIMESTER_NAMES[D.trimester(ctx.ga.days)]} · ${Math.max(ctx.ga.weeks, 0)} 周`;
    const b = app.state.baby;
    return `${ctx.sinceBirth < 42 ? '坐月子' : '哺乳期'} · 宝宝 ${Bb.ageText(Bb.ageOf(b.birthDate, D.addDays(b.birthDate, Math.max(0, ctx.sinceBirth))))}`;
  }

  /** 产后头几天、坐月子的时候，在哺乳期的重点前面多说一句 */
  function stageTip(ctx) {
    if (ctx.stage !== 'nursing') return BOOK.tips[ctx.stage];
    return [ctx.sinceBirth < 4 ? BOOK.tips.firstDays : '', ctx.sinceBirth < 42 ? BOOK.tips.confinement : '', BOOK.tips.nursing].filter(Boolean).join('');
  }

  function viewMenu() {
    const date = dayOf(ui.recipeDay);
    const ctx = context(date);
    const meals = R.menu(BOOK, app.state.meals, date, ctx);
    const covered = R.coverage(meals);
    return `
      <article class="card recipe-intro">
        <div class="recipe-intro-top">
          <p class="eyebrow">${stageTitle(ctx)}</p>
          ${daySwitch()}
        </div>
        <p class="recipe-tip">${esc(stageTip(ctx))}</p>
        ${ctx.sugar ? `<p class="recipe-sugar">${A.icon.drop}<span>${esc(BOOK.tips.sugar.replace('{n}', ctx.high))}</span></p>` : ''}
        ${viewAvoid()}
      </article>
      <article class="card recipe-menu" aria-label="${dayLabel(ui.recipeDay)}的菜单">
        <div class="meal-grid">${meals.map(viewMeal).join('')}</div>
        ${covered.length ? `<p class="recipe-cover">这份菜单里有${covered.map((t) => `<span class="tag">${t.name}</span>`).join('')}</p>` : ''}
        <p class="fineprint">都是 2 人份的家常做法，点菜名看用料和做法。参考《中国孕妇、乳母膳食指南（2022）》；有妊娠糖尿病、贫血、过敏或者医生特别交代的，听医生和营养师的。</p>
      </article>`;
  }

  function viewAvoid() {
    const st = app.state.meals;
    const names = R.AVOIDS.filter((a) => st.avoid.includes(a.id)).map((a) => a.name);
    return `
      <details class="recipe-avoid" id="recipe-avoid"${ui.avoidOpen ? ' open' : ''}>
        <summary>${names.length ? `忌口：${names.join('、')}` : '有不吃的？设置忌口'}</summary>
        <div class="recipe-chips" role="group" aria-label="忌口">
          ${R.AVOIDS.map((a) => `<button type="button" class="chip" id="avoid-${a.id}" data-action="recipe-avoid" data-id="${a.id}" aria-pressed="${st.avoid.includes(a.id)}">${a.name}</button>`).join('')}
        </div>
        <p class="hint">选上的不会出现在菜单和全部食谱里。</p>
      </details>`;
  }

  function viewMeal(m) {
    const staple = m.staple ? `<small>主食：${esc(m.staple.name)}${m.staple.note ? `（${esc(m.staple.note)}）` : ''}</small>` : '';
    return `
      <section class="meal">
        <h3 class="meal-name">${m.name}${staple}</h3>
        <ul class="dish-list">${m.dishes.map((x) => viewDish(x, m)).join('')}</ul>
      </section>`;
  }

  function viewDish({ key, kind, recipe }, m) {
    const label = m.dishes.length > 1 ? kindName[kind] : '';
    if (!recipe) return `<li class="dish is-empty">${label ? `${label}：` : ''}按你的忌口，这一格挑不出合适的菜</li>`;
    return `
      <li class="dish">
        <button type="button" class="dish-open" id="dish-${key}" data-action="open-recipe" data-id="${recipe.id}" data-key="${key}">
          ${recipeDot(recipe)}
          <span class="dish-name">${esc(recipe.name)}</span>
          <span class="dish-meta">${label ? `${label} · ` : ''}${recipe.minutes} 分钟 · ${recipe.good.slice(0, 2).map((g) => tagName[g]).join(' · ')}</span>
        </button>
        ${favButton(recipe)}
        <button type="button" class="icon-btn icon-btn-sm" id="swap-${key}" data-action="recipe-swap" data-key="${key}" aria-label="${m.name}${label}换一道" title="换一道">${A.icon.shuffle}</button>
      </li>`;
  }

  // ---------- 全部食谱 ----------

  function viewLibrary() {
    const chip = (action, value, current, label) =>
      `<button type="button" class="chip" id="${action}-${value}" data-action="${action}" data-value="${value}" aria-pressed="${current === value}">${label}</button>`;
    return `
      <article class="card recipe-library">
        <input type="search" id="recipe-q" class="food-search" placeholder="搜菜名或用料，比如 豆腐、牛肉" autocomplete="off" enterkeyhint="search" value="${esc(ui.recipeQuery)}" aria-label="搜索食谱">
        <div class="recipe-chips" role="group" aria-label="按类别">
          ${chip('recipe-kind', 'all', ui.recipeKind, '全部')}${R.KINDS.map((k) => chip('recipe-kind', k.id, ui.recipeKind, k.name)).join('')}
        </div>
        <div class="recipe-chips" role="group" aria-label="只看">
          ${chip('recipe-only', 'favorites', ui.recipeOnly, `${A.icon.heart}收藏`)}${chip('recipe-only', 'gdm', ui.recipeOnly, '控糖友好')}${chip('recipe-only', 'light', ui.recipeOnly, '清淡开胃')}
          ${R.TAGS.map((t) => chip('recipe-tag', t.id, ui.recipeTag, t.name)).join('')}
        </div>
        <div id="recipe-results">${viewLibraryResults()}</div>
      </article>`;
  }

  function viewLibraryResults() {
    const st = app.state.meals;
    const filters = { kind: ui.recipeKind, tag: ui.recipeTag, only: ui.recipeOnly, query: ui.recipeQuery };
    const { list, hidden } = R.library(BOOK, st, context(ui.today).stage, filters);
    const note = hidden ? `<p class="recipe-hidden">还有 ${hidden} 道碰到你的忌口，或者这个阶段先不吃，没有列出来。</p>` : '';
    if (!list.length) {
      const empty = ui.recipeOnly === 'favorites' && !st.favorites.length ? '还没有收藏的菜，看到喜欢的点一下小爱心。' : '没找到合适的，换个条件试试。';
      return `${note}<p class="food-empty">${empty}</p>`;
    }
    return note + R.KINDS.map((k) => {
      const items = list.filter((r) => r.kind === k.id);
      if (!items.length) return '';
      return `
        <section class="recipe-group">
          <h3>${k.name}<small>${items.length} 道</small></h3>
          <ul class="dish-list">${items.map((r) => `
            <li class="dish">
              <button type="button" class="dish-open" id="dish-${r.id}" data-action="open-recipe" data-id="${r.id}">
                ${recipeDot(r)}
                <span class="dish-name">${esc(r.name)}</span>
                <span class="dish-meta">${r.minutes} 分钟 · ${r.good.map((g) => tagName[g]).join(' · ')}${r.gdm ? ' · 控糖友好' : ''}${r.stages ? ' · 孕中晚期吃' : ''}</span>
              </button>
              ${favButton(r)}
            </li>`).join('')}
          </ul>
        </section>`;
    }).join('');
  }

  // ---------- 买菜清单 ----------

  function viewShopping() {
    const date = dayOf(ui.recipeDay);
    const list = R.shopping(BOOK, menuOn(date), app.state.meals, date);
    const pct = list.total ? (list.done / list.total) * 100 : 0;
    const left = list.total - list.done;
    return `
      <article class="card recipe-shop">
        <header class="card-head">
          <div>
            <h2 class="card-title">${A.icon.bag}${dayLabel(ui.recipeDay)}的买菜清单</h2>
            <p class="card-meta">${list.total ? `已买 ${list.done}/${list.total} · 按${dayLabel(ui.recipeDay)}的菜单算的 2 人份` : '菜单里没有要买的'}</p>
          </div>
          ${daySwitch()}
        </header>
        ${list.total ? `
          <div class="bag-progress${left ? '' : ' is-full'}" role="progressbar" aria-label="买菜进度" aria-valuemin="0" aria-valuemax="${list.total}" aria-valuenow="${list.done}">
            <i style="width:${pct.toFixed(1)}%"></i>
          </div>` : ''}
        ${list.total && !left ? `<p class="bag-ready"><span class="bag-ready-bee">${A.bee}</span>都买齐啦，回家做饭咯。</p>` : ''}
        <div class="bag-groups">${list.groups.map((g) => `
          <section class="bag-group">
            <h3 class="bag-group-title">${g.name}<small>${g.items.filter((i) => i.bought).length}/${g.items.length}</small></h3>
            <ul class="bag-list">${g.items.map(viewShopItem).join('')}</ul>
          </section>`).join('')}
        </div>
        ${list.season.length ? `<p class="recipe-season"><b>调料和葱姜蒜</b>${list.season.map(esc).join('、')}<span>家里一般都有，没有的记得买</span></p>` : ''}
        <div class="btn-row">
          ${left ? `<button type="button" class="btn btn-sm" data-action="share-shopping">${A.icon.notes}发给家人</button>` : ''}
          ${list.done ? '<button type="button" class="btn btn-ghost btn-sm" data-action="clear-shopping">清空勾选</button>' : ''}
        </div>
        <p class="fineprint">午饭、晚饭配的米饭杂粮没算进来。换了菜，清单会跟着变；勾过的按天记着。</p>
      </article>`;
  }

  function viewShopItem(it) {
    const name = esc(it.name);
    return `
      <li class="bag-item${it.bought ? ' is-done' : ''}">
        <label class="bag-check">
          <input type="checkbox" id="shop-${name}" data-action="toggle-shopping" data-name="${name}"${it.bought ? ' checked' : ''}>
          <span class="bag-box" aria-hidden="true">${A.icon.check}</span>
          <span class="bag-text"><span class="bag-name">${name} ${esc(it.amount)}</span><span class="bag-note">${esc(it.dishes.join('、'))}</span></span>
        </label>
      </li>`;
  }

  Object.assign(app, { recipeContext: context, recipeDot, recipeStatus, todoMeal, viewRecipesTool, viewLibraryResults });
})();
