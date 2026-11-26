(function () {
  'use strict';
  // 事件绑定、每秒刷新、启动
  const { dates: D, model: M, storage: S, app } = globalThis.Baby;
  const {
    root, toastBox, DIALOGS, ui, scrollToNow, viewFoodResults, viewLibraryResults, paintClocks, render, currentRoute, drawCharts,
    syncWakeLock, onDialogClose, closeDialog, fillFromReport, toast, oops, say, cheer, persist, checkNotifications, forms,
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

  // 触屏可在心情页横滑，鼠标在月历内按住左键拖动。普通点击仍然打开日期。
  let drag = null;
  let suppressClick = false;
  let settling = null;
  function finishDrag(commit) {
    const gesture = drag;
    drag = null;
    if (!gesture) return;
    const { grid, calendar, offset } = gesture;
    calendar.classList.remove('is-dragging');
    if (!gesture.moved || !calendar.isConnected) return;
    const step = offset < 0 ? 1 : -1;
    const button = calendar.querySelector(`[data-action="mood-month"][data-step="${step}"]`);
    const turn = commit && Math.abs(offset) >= 50 && !button.disabled;
    const end = turn ? -step * grid.clientWidth : 0;
    grid.style.transform = '';
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (turn) button.click();
      return;
    }
    const motion = grid.animate([
      { transform: `translateX(${offset}px)` }, { transform: `translateX(${end}px)` },
    ], { duration: turn ? 130 : 160, easing: 'ease-out' });
    settling = motion;
    motion.finished.then(() => {
      if (settling !== motion) return;
      settling = null;
      if (turn && calendar.isConnected) button.click();
    }, () => {});
  }

  root.addEventListener('pointerdown', (e) => {
    suppressClick = false;
    if (!e.isPrimary) return finishDrag(false);
    const page = e.target.closest(e.pointerType === 'mouse' ? '.mcal' : '.page-journal');
    if (!page || e.button !== 0) return;
    const calendar = page.closest('.mcal') || page.querySelector('.mcal');
    if (settling) { settling.cancel(); settling = null; }
    drag = { id: e.pointerId, calendar, grid: calendar.querySelector('.mcal-grid'), x: e.clientX, y: e.clientY, moved: false, offset: 0 };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) return finishDrag(false);
      if (Math.abs(dx) < 8 || Math.abs(dx) < 1.5 * Math.abs(dy)) return;
      drag.moved = true;
      drag.calendar.classList.add('is-dragging');
      if (drag.calendar.isConnected && e.isTrusted) {
        drag.calendar.setPointerCapture(e.pointerId);
      }
      drag.grid.getAnimations().forEach((motion) => motion.cancel());
    }
    const limit = drag.grid.clientWidth;
    drag.offset = Math.max(-limit, Math.min(limit, dx));
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) drag.grid.style.transform = `translateX(${drag.offset}px)`;
  });
  window.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    suppressClick = drag.moved;
    finishDrag(true);
  });
  window.addEventListener('pointercancel', (e) => { if (drag?.id === e.pointerId) finishDrag(false); });
  window.addEventListener('blur', () => finishDrag(false));
  root.addEventListener('click', (e) => {
    if (suppressClick && e.detail) {
      e.preventDefault();
      e.stopPropagation();
      suppressClick = false;
    }
  }, true);

  document.addEventListener('change', (e) => {
    if (e.target.name === 'slot' && e.target.closest('.gl-form')) ui.glucoseSlot = e.target.value;
    if (e.target.classList.contains('story-voice')) setStoryVoice(e.target.dataset.lang, e.target.value);
  });

  // 「全部故事」「忌口」展开着的话，点了里面的按钮重绘后也保持展开
  document.addEventListener('toggle', (e) => {
    if (e.target.id === 'story-shelf') ui.storyShelf = e.target.open;
    if (e.target.id === 'recipe-avoid') ui.avoidOpen = e.target.open;
    if (e.target.id === 'food-tried') ui.triedOpen = e.target.open;
    if (e.target.id === 'vx-done') ui.vaccinesDoneOpen = e.target.open;
    if (e.target.id === 'ex-done') ui.examsDoneOpen = e.target.open;
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
      const box = e.target.closest('.seg') || e.target;
      box.dataset.manual = '1';
      box.classList.remove('is-filled');
    }
    if (e.target.id === 'noise-volume') {
      app.setNoiseVolume(Number(e.target.value));
      return;
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

  // 同一台设备上别的标签页改了记录、云同步的设置。只是把暂存挪进 IndexedDB 的不算改了；
  // 要去 IndexedDB 取的月份取齐了再换上，连着改了几次的以最后一次为准
  let reloads = 0;
  window.addEventListener('storage', (e) => {
    if (e.key === `${S.KEY}:cloud` || e.key === null) app.cloudReload();
    if (e.key !== null && (!S.KEYS.includes(e.key) || !S.changedElsewhere())) return;
    const ticket = ++reloads;
    const apply = (state) => {
      if (ticket !== reloads) return;
      app.resetTransient();
      app.state = state;
      if (!app.state) DIALOGS.forEach((d) => closeDialog(d));
      render();
    };
    const next = S.load();
    if (S.isPartial(next)) S.complete(next).then(apply, () => {});
    else apply(next);
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawCharts, 120);
  });

  function start() {
    // 上次关页面时没数完的，打开时直接按满 1 小时收尾，不再弹提示
    if (app.state && M.settleKicks(app.state, Date.now())) persist();
    app.started = true;
    render();
    scrollToNow();
    checkNotifications();
    setInterval(clock, 1000);
    app.markReady();
    S.resume();
    const lost = S.lostMonths().length;
    if (lost) oops(`有 ${lost} 个月的宝宝日常记录没找到，可能被浏览器清掉了；开着云同步或者有备份的话，可以从那里拿回来`);
    // 日常记录搬进 IndexedDB；网址带 ?noidb 时不搬，测试里接着用 localStorage 模拟几台手机
    if (!/[?&]noidb\b/.test(location.search)) setTimeout(() => S.migrate(() => app.state), 1500);
  }

  if (S.isPartial(app.state)) {
    S.complete(app.state).then((full) => {
      app.state = full;
      start();
    }, () => {
      start();
      toast('宝宝的日常记录这次没读出来，先别记日常', null, { label: '重新打开', action: 'reload-app' }, 'oops');
    });
  } else {
    start();
  }

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
