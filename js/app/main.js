(function () {
  'use strict';
  // 事件绑定、每秒刷新、启动
  const { dates: D, model: M, storage: S, app } = globalThis.Baby;
  const {
    root, toastBox, DIALOGS, ui, scrollToNow, viewFoodResults, viewLibraryResults, paintClocks, render, currentRoute, drawCharts,
    syncWakeLock, onDialogClose, closeDialog, fillFromReport, toast, say, cheer, persist, checkNotifications, forms,
    actions, stopReading, setStoryVoice, checkForUpdate
  } = app;

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) {
      e.preventDefault();
      actions[el.dataset.action](el);
      return;
    }
    // 点当前所在的那个标签，回到页面顶部（和手机 App 的习惯一样）
    const link = e.target.closest('a[href^="#/"]');
    if (link && link.getAttribute('href') === (location.hash || '#/')) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.name === 'slot' && e.target.closest('.gl-form')) ui.glucoseSlot = e.target.value;
    if (e.target.name === 'mood' && e.target.closest('form[data-form="journal"]')) ui.journalMood = e.target.value;
    if (e.target.classList.contains('story-voice')) setStoryVoice(e.target.dataset.lang, e.target.value);
  });

  // 「全部故事」「忌口」展开着的话，点了里面的按钮重绘后也保持展开
  document.addEventListener('toggle', (e) => {
    if (e.target.id === 'story-shelf') ui.storyShelf = e.target.open;
    if (e.target.id === 'recipe-avoid') ui.avoidOpen = e.target.open;
    if (e.target.id === 'food-tried') ui.triedOpen = e.target.open;
    if (e.target.id === 'vx-done') ui.vaccinesDoneOpen = e.target.open;
  }, true);

  window.addEventListener('hashchange', () => {
    ui.bagAdding = null;
    ui.kickFeedback = '';
    if (currentRoute().sub !== 'story') stopReading();
    render();
    if (!scrollToNow()) window.scrollTo(0, 0);
  });

  document.addEventListener('submit', (e) => {
    const handler = forms[e.target.dataset.form];
    if (!handler) return;
    e.preventDefault();
    handler(e.target);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && e.target.id === 'bag-new') actions['cancel-bag-item']();
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'us-paste') {
      fillFromReport(e.target);
      return;
    }
    // B 超表单里自己改过的格子：不再标成「自动填的」，之后再粘贴也不动它
    if (e.target.closest('form[data-form="ultrasound"]')) {
      e.target.dataset.manual = '1';
      e.target.classList.remove('is-filled');
    }
    if (e.target.id === 'recipe-q') {
      ui.recipeQuery = e.target.value;
      document.getElementById('recipe-results').innerHTML = viewLibraryResults();
      return;
    }
    if (e.target.id !== 'food-q') return;
    ui.foodQuery = e.target.value;
    document.getElementById('food-results').innerHTML = viewFoodResults();
  });

  for (const dialog of DIALOGS) {
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) closeDialog(dialog);
    });
    dialog.addEventListener('close', onDialogClose);
    dialog.addEventListener('cancel', () => setTimeout(onDialogClose, 0));
  }

  // 每秒刷新倒计时；数胎动满 1 小时自动结束
  function clock() {
    const now = Date.now();
    if (app.state && currentRoute().sub === 'contractions') {
      const running = M.activeContraction(app.state);
      const long = Boolean(running) && now - running.start > M.CONTRACTION_LONG;
      if (long !== Boolean(root.querySelector('.ctx-long'))) render();
    }
    const finished = app.state && M.settleKicks(app.state, now);
    if (!finished) return paintClocks(now);
    ui.kickFeedback = '';
    persist();
    render();
    const r = M.kickReview(app.state, now).find((x) => x.session === finished);
    toast(`1 小时到啦，这次胎动 ${r.count} 次${r.verdict === 'ok' ? `，${say('kicksDone')}` : ''}`);
    if (r.verdict === 'ok') cheer(toastBox.querySelector('.toast-bee'));
  }

  function tick() {
    const today = D.today();
    if (today !== ui.today) {
      ui.today = today;
      render();
    }
    checkNotifications();
    syncWakeLock();
  }

  setInterval(tick, 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    tick();
    checkForUpdate();
  });

  window.addEventListener('storage', (e) => {
    if (e.key !== S.KEY) return;
    app.state = S.load();
    if (!app.state) DIALOGS.forEach(closeDialog);
    render();
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawCharts, 120);
  });

  // 上次关页面时没数完的，打开时直接按满 1 小时收尾，不再弹提示
  if (app.state && M.settleKicks(app.state, Date.now())) persist();
  render();
  scrollToNow();
  checkNotifications();
  setInterval(clock, 1000);

  // 通过网址打开时离线也能用；直接双击打开的本地文件不需要
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
    // 网慢时这次打开用的是缓存里的旧文件，新的在后台下载完了
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data !== 'update-ready') return;
      ui.updateReady = true;
      checkForUpdate();
    });
  }
})();
