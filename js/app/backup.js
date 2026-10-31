(function () {
  'use strict';
  // 设置里管数据的按钮：导出、导入备份，发给家人、合并家人的记录，备份提醒，恢复默认的产检和待产包，清空全部数据
  const { dates: D, model: M, storage: S, merge: Mg, app } = globalThis.Baby;
  const {
    settingsDialog, sheetDialog, ui, render, closeDialog, openMergeSheet, formError, toast, oops, say, cheer, persist, saveFile,
  } = app;

  /** 选一个 .json 文件，读出文字交给 then */
  function pickJson(then) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (file) then(await file.text());
    });
    input.click();
  }

  // 文件里记的导出时间，例如「10月28日 21:30」；读不出来就不显示
  function exportedAt(text) {
    try {
      const t = new Date(JSON.parse(text).exportedAt);
      if (Number.isNaN(t.getTime())) return '';
      const pad = (n) => String(n).padStart(2, '0');
      return `${D.formatDate(D.localISO(t), { relativeTo: ui.today })} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
    } catch (e) {
      return '';
    }
  }

  /** 家人发来的文件：先合一份看看加了什么，点「合并」时再按那会儿的记录合一遍换上 */
  function previewMerge(text) {
    let other;
    try {
      other = S.parseBackup(text);
    } catch (e) {
      if (settingsDialog.open) formError(settingsDialog.querySelector('form'), e.message);
      else oops(e.message);
      return;
    }
    ui.mergePending = other;
    if (settingsDialog.open) closeDialog(settingsDialog);
    openMergeSheet(Mg.merge(app.state, other), exportedAt(text));
  }

  // 宝宝的日常记录这次没读全：备份会缺月份，导入、合并的也存不全，先别做
  function notNow() {
    if (!S.isBroken()) return false;
    oops('宝宝的日常记录这次没读出来，先关掉蜜罐再打开');
    return true;
  }

  const backupActions = {
    async 'export-backup'(el) {
      if (notNow()) return;
      const backedUp = { ...app.state, prefs: { ...app.state.prefs, lastBackup: ui.today, backupNudged: null } };
      const how = await saveFile(S.backupText(backedUp, new Date()), `蜜罐备份-${ui.today}.json`, 'application/json');
      if (how === 'cancelled') return;
      cheer(el);
      M.markBackedUp(app.state, ui.today);
      persist();
      render();
      const message = how === 'shared' ? say('backup') : '备份已经下载好了，放在安全的地方。';
      if (!settingsDialog.open) return toast(message);
      formError(settingsDialog.querySelector('form'), '');
      settingsDialog.querySelector('.backup-state').textContent = message;
    },

    'import-backup'() {
      if (notNow()) return;
      const form = settingsDialog.open ? settingsDialog.querySelector('form') : document.querySelector('form[data-form="onboard"]');
      pickJson((text) => {
        try {
          const next = S.parseBackup(text);
          if (app.state && !window.confirm('导入会覆盖现在的全部记录，确定吗？')) return;
          app.resetTransient();
          app.state = next;
          persist();
          if (settingsDialog.open) closeDialog(settingsDialog);
          render();
          toast('备份导入好了');
        } catch (e) {
          if (form) formError(form, e.message);
          else oops(e.message);
        }
      });
    },

    async 'share-family'(el) {
      if (notNow()) return;
      const how = await saveFile(S.backupText(app.state, new Date()), `蜜罐-发给家人-${ui.today}.json`, 'application/json');
      if (how === 'cancelled') return;
      cheer(el);
      const message = how === 'shared' ? '发好了，让家人在设置里点「合并家人的记录」，选这个文件'
        : '文件下载好了，用微信发给家人，让对方在设置里点「合并家人的记录」';
      const state = settingsDialog.open && settingsDialog.querySelector('.family-state');
      if (!state) return toast(message);
      state.textContent = message;
      state.hidden = false;
    },

    'merge-family'() {
      if (notNow()) return;
      pickJson(previewMerge);
    },

    'merge-apply'() {
      if (!ui.mergePending) return;
      const r = Mg.merge(app.state, ui.mergePending);
      const before = app.state;
      app.state = r.state;
      ui.mergePending = null;
      persist();
      closeDialog(sheetDialog);
      render();
      const what = [r.added ? `加了 ${r.added} 条` : '', r.updated ? `改了 ${r.updated} 条` : '', r.dropped ? `删了 ${r.dropped} 条` : ''].filter(Boolean).join('、');
      toast(`合并好了，${what}`, () => { app.state = before; });
    },

    'snooze-backup'() {
      M.snoozeBackup(app.state, ui.today);
      persist();
      render();
      toast('好，过一个星期再提醒你');
    },

    'reset-checkups'() {
      if (!window.confirm('恢复默认产检日程会清掉你改过的日期和完成状态（自己添加的会保留），确定吗？')) return;
      const before = app.state.checkups;
      M.resetCheckups(app.state);
      persist();
      closeDialog(settingsDialog);
      render();
      toast('产检日程恢复成默认了', () => { app.state.checkups = before; });
    },

    'reset-bag'() {
      if (!window.confirm('恢复默认待产包会清掉默认物品的勾选、找回删掉的（自己添加的不受影响），确定吗？')) return;
      const before = app.state.bag;
      M.resetBag(app.state);
      persist();
      closeDialog(settingsDialog);
      render();
      toast('待产包恢复成默认清单了', () => { app.state.bag = before; });
    },

    'clear-all'() {
      const cloud = app.cloudOn() ? '这台手机的云同步也会断开，云端的数据不会删。' : '';
      if (!window.confirm(`确定清空全部数据吗？清空后找不回来，建议先导出备份。${cloud}`)) return;
      app.cloudOff();
      app.resetTransient();
      S.clear();
      app.state = null;
      ui.bagAdding = null;
      closeDialog(settingsDialog);
      render();
    },
  };

  Object.assign(app, { backupActions, previewMerge });
})();
