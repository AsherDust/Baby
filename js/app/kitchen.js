(function () {
  'use strict';
  // 孕期食谱的按钮：看做法、换一道、收藏、忌口、放进菜单，买菜清单打勾和发给家人
  const { dates: D, recipes: R, recipeBook: BOOK, art: A, app } = globalThis.Baby;
  const {
    sheetDialog, esc, isTouch, ui, render, showDialog, dialogHead, toast, oops, say, cheer, persist, recipeContext, recipeDot
  } = app;

  const kindName = Object.fromEntries(R.KINDS.map((k) => [k.id, k.name]));
  const tagName = Object.fromEntries(R.TAGS.map((t) => [t.id, t.name]));
  const mealName = Object.fromEntries(R.MEALS.map((m) => [m.id, m.name]));
  const meals = () => app.state.meals;
  const dateOf = () => D.addDays(ui.today, ui.recipeDay);
  const dayLabel = () => (ui.recipeDay ? '明天' : '今天');
  const menuOf = (date) => R.menu(BOOK, meals(), date, recipeContext(date));
  const openSheet = () => (sheetDialog.open && sheetDialog.querySelector('.recipe-sheet')) || null;

  /** 换菜、放菜之前存一份这天的，撤销时放回去 */
  function keepDay(date) {
    const st = meals();
    const before = st.days[date] ? { ...st.days[date] } : null;
    return () => {
      if (before) st.days[date] = before;
      else delete st.days[date];
    };
  }

  /** 做法面板。key 是从菜单的哪一格点进来的；从全部食谱点进来的没有，可以放进菜单 */
  function openRecipe(id, key = '') {
    const r = R.find(BOOK, id);
    if (!r) return;
    const st = meals();
    const date = dateOf();
    const ctx = recipeContext(date);
    const fav = st.favorites.includes(r.id);
    const fits = R.fits(BOOK, r, st, ctx.stage);
    const used = R.menu(BOOK, st, date, ctx).flatMap((m) => m.dishes).filter((x) => x.recipe === r).map((x) => x.key);
    let more = '';
    if (key) {
      more = `<button type="button" class="btn btn-ghost" data-action="recipe-swap" data-key="${key}">${A.icon.shuffle}换一道</button>`;
    } else if (fits) {
      more = R.slotsFor(r.kind, ctx).map((s) => (used.includes(s.key)
        ? `<span class="recipe-in">${A.icon.check}已在${dayLabel()}${mealName[s.meal]}</span>`
        : `<button type="button" class="btn btn-ghost" data-action="recipe-place" data-id="${r.id}" data-key="${s.key}">放进${dayLabel()}${mealName[s.meal]}</button>`)).join('');
    }
    const tags = [
      ...r.good.map((g) => `<span class="tag tag-good">${tagName[g]}</span>`),
      r.gdm ? '<span class="tag tag-booked">控糖友好</span>' : '',
      r.light ? '<span class="tag">清淡开胃</span>' : '',
      r.stages ? '<span class="tag">孕中晚期吃</span>' : '',
    ].join('');
    sheetDialog.innerHTML = `
      <div class="dialog-body recipe-sheet" data-id="${r.id}" data-key="${key}">
        ${dialogHead(`${recipeDot(r)}${esc(r.name)}`, `${kindName[r.kind]} · 约 ${r.minutes} 分钟 · 2 人份`)}
        <p class="recipe-tags">${tags}</p>
        <p class="recipe-why">${A.icon.leaf}<span>${esc(r.why)}</span></p>
        <section class="recipe-part">
          <h3>用料</h3>
          <ul class="recipe-items">${r.items.map((it) => `<li><span>${esc(it[0])}</span><b>${esc(R.itemText(it))}</b></li>`).join('')}</ul>
          ${r.season.length ? `<p class="recipe-season-line">调料：${r.season.map(esc).join('、')}</p>` : ''}
        </section>
        <section class="recipe-part">
          <h3>做法</h3>
          <ol class="recipe-steps">${r.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        </section>
        ${r.tip ? `<p class="recipe-note"><b>小贴士</b>${esc(r.tip)}</p>` : ''}
        ${fits ? '' : '<p class="hint">这道碰到了你的忌口，或者这个阶段先不吃，不会出现在菜单里。</p>'}
        <div class="dialog-actions">
          <button type="button" class="btn btn-ghost recipe-fav-btn" data-action="recipe-fav" data-id="${r.id}" aria-pressed="${fav}">${A.icon.heart}${fav ? '已收藏' : '收藏'}</button>
          <span class="spacer"></span>
          ${more}
        </div>
      </div>`;
    showDialog(sheetDialog);
  }

  /** 改了菜单以后，开着的做法面板也跟着换 */
  function refreshSheet(id, key) {
    const sheet = openSheet();
    if (sheet && (!key || sheet.dataset.key === key)) openRecipe(id || sheet.dataset.id, sheet.dataset.key);
  }

  const recipeActions = {
    'open-recipe'(el) {
      // 首页点的可能是明天早餐，面板里换菜、放菜都按这一天
      if (el.dataset.day) ui.recipeDay = el.dataset.day === '1' ? 1 : 0;
      openRecipe(el.dataset.id, el.dataset.key || '');
    },

    'recipe-swap'(el) {
      const date = dateOf();
      const key = el.dataset.key;
      const undo = keepDay(date);
      const next = R.swap(BOOK, meals(), date, key, recipeContext(date));
      if (!next) return oops('按现在的忌口，这一格没有别的可换了');
      persist();
      ui.focusNext = el.id;
      render();
      refreshSheet(next.id, key);
      toast(say('recipeSwap', { name: next.name }), () => {
        undo();
        const back = menuOf(date).flatMap((m) => m.dishes).find((x) => x.key === key).recipe;
        if (back) refreshSheet(back.id, key);
      });
    },

    'recipe-fav'(el) {
      const r = R.find(BOOK, el.dataset.id);
      if (!r) return;
      const on = R.toggleFavorite(meals(), r.id);
      persist();
      ui.focusNext = el.id;
      render();
      if (openSheet()) refreshSheet(r.id);
      toast(on ? say('recipeFav') : `「${r.name}」取消收藏了`);
    },

    'recipe-place'(el) {
      const date = dateOf();
      const undo = keepDay(date);
      const r = R.place(BOOK, meals(), date, el.dataset.key, el.dataset.id);
      if (!r) return;
      persist();
      render();
      refreshSheet(r.id);
      const meal = mealName[R.SLOTS.find((s) => s.key === el.dataset.key).meal];
      toast(`「${r.name}」放进${dayLabel()}${meal}了`, () => {
        undo();
        refreshSheet(r.id);
      });
    },

    'recipe-avoid'(el) {
      const a = R.AVOIDS.find((x) => x.id === el.dataset.id);
      if (!a) return;
      const on = R.toggleAvoid(meals(), a.id);
      persist();
      ui.avoidOpen = true;
      ui.focusNext = el.id;
      render();
      toast(on ? `好的，有${a.name}的菜都不推荐了` : `有${a.name}的菜也会推荐了`);
    },

    'recipe-day'(el) {
      ui.recipeDay = el.dataset.day === '1' ? 1 : 0;
      ui.focusNext = el.id;
      render();
    },

    'recipe-kind'(el) {
      ui.recipeKind = el.dataset.value;
      ui.focusNext = el.id;
      render();
    },

    'recipe-only'(el) {
      ui.recipeOnly = ui.recipeOnly === el.dataset.value ? '' : el.dataset.value;
      ui.focusNext = el.id;
      render();
    },

    'recipe-tag'(el) {
      ui.recipeTag = ui.recipeTag === el.dataset.value ? '' : el.dataset.value;
      ui.focusNext = el.id;
      render();
    },

    'toggle-shopping'(el) {
      const date = dateOf();
      const on = R.toggleBought(meals(), date, el.dataset.name);
      persist();
      ui.focusNext = el.id;
      render();
      const list = R.shopping(BOOK, menuOf(date), meals(), date);
      if (on && list.done === list.total) {
        toast(say('shopDone'));
        cheer(document.querySelector('.bag-ready-bee'));
      }
    },

    'clear-shopping'() {
      const st = meals();
      const date = dateOf();
      const before = st.bought[date];
      if (!before) return;
      delete st.bought[date];
      persist();
      render();
      toast('勾选都清空了', () => { st.bought[date] = before; });
    },

    async 'share-shopping'() {
      const date = dateOf();
      const list = R.shopping(BOOK, menuOf(date), meals(), date);
      const text = R.shoppingText(list, `买菜清单 · ${D.formatDate(date)}（2 人份）`);
      // 分享必须在点击里同步发起，前面不能有 await
      if (isTouch() && navigator.share) {
        try {
          await navigator.share({ text });
          return;
        } catch (e) {
          if (e.name === 'AbortError') return;
        }
      }
      try {
        await navigator.clipboard.writeText(text);
        toast('清单复制好了，粘贴到微信里发给家人吧');
      } catch (e) {
        oops('没能复制，可以截个图发给家人');
      }
    },
  };

  Object.assign(app, { recipeActions, openRecipe });
})();
