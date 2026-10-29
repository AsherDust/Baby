(function () {
  'use strict';
  // 表单提交和按钮动作
  const { dates: D, content: C, model: M, storage: S, journal: J, app } = globalThis.Baby;
  const {
    settingsDialog, checkupDialog, medDialog, sheetDialog, notifyPermission, JOURNAL_SHOWN, ui, render, go, closeDialog,
    openGlucoseSheet, openUltrasoundSheet, openJournalSheet, openSettings, openCheckupDialog, openMedDialog, formError,
    toast, oops, say, cheer, persist, saveFile, downloadCalendar, readProfile, saveWeight, saveGlucose,
    checkNotifications, storyActions, recipeActions, babyForms, babyActions
  } = app;

  const submitButton = (form) => form.querySelector('button:not([type="button"])');
  const journalFields = (form) => ({
    mood: form.elements.mood.value,
    text: form.elements.text.value,
    date: form.elements.date.value,
  });

  const forms = {
    onboard(form) {
      const { profile, error } = readProfile(form);
      if (error) return formError(form, error);
      cheer(submitButton(form));
      app.state = M.createState(profile, ui.today);
      persist();
      render();
      toast(say('onboard'));
      checkNotifications();
    },

    journal(form) {
      const f = journalFields(form);
      const error = J.entryError(f, ui.today);
      if (error) return formError(form, error);
      cheer(submitButton(form));
      const entry = J.add(app.state, f, ui.today, Date.now());
      persist();
      ui.journalMood = '';
      ui.clearInputs.push('j-text', 'j-date');
      render();
      toast(say(`mood-${entry.mood}`), () => J.remove(app.state, entry.id));
    },

    'journal-edit'(form) {
      const f = journalFields(form);
      const error = J.entryError(f, ui.today);
      if (error) return formError(form, error);
      J.update(app.state, form.dataset.id, f);
      persist();
      closeDialog(sheetDialog);
      render();
      toast(say('saved'));
    },

    settings(form) {
      const { profile, error } = readProfile(form);
      if (error) return formError(form, error);
      const dueChanged = profile.dueDate !== app.state.profile.dueDate;
      app.state.profile = profile;
      persist();
      closeDialog(settingsDialog);
      render();
      toast(dueChanged ? '预产期更新了，建议日期也跟着调整好了' : say('saved'));
    },

    'quick-weight'(form) {
      saveWeight(ui.today, form.elements.kg.value, ['quick-kg']);
    },

    'add-weight'(form) {
      saveWeight(form.elements.date.value || ui.today, form.elements.kg.value, ['w-kg', 'w-date']);
    },

    'add-bp'(form) {
      const f = Object.fromEntries(new FormData(form));
      const error = M.bpError(f, ui.today);
      if (error) return formError(form, error);
      const record = M.addBp(app.state, f);
      persist();
      ui.clearInputs.push('bp-sys', 'bp-dia', 'bp-pulse', 'bp-date', 'bp-time');
      render();
      const level = M.bpLevel(record);
      const note = { severe: '，很高，注意看上面的提醒', high: '，偏高，休息一下再量一次', low: '，偏低' }[level] || '';
      toast(`${record.sys}/${record.dia} 记好了${note}`, () => M.removeBp(app.state, record.id));
    },

    'add-glucose'(form) {
      const f = Object.fromEntries(new FormData(form));
      const error = M.glucoseError(f, ui.today);
      if (error) return formError(form, error);
      saveGlucose(f, () => ui.clearInputs.push('gl-value', 'gl-date'));
    },

    'glucose-cell'(form) {
      const f = { date: form.dataset.date, slot: form.dataset.slot, value: form.elements.value.value };
      const error = M.glucoseError(f, ui.today);
      if (error) return formError(form, error);
      closeDialog(sheetDialog);
      saveGlucose(f);
    },

    ultrasound(form) {
      const f = new FormData(form);
      const fields = {
        date: String(f.get('date') || ''),
        values: Object.fromEntries(C.US_FIELDS.map((x) => [x.id, String(f.get(`v-${x.id}`) || '')])),
        placenta: String(f.get('placenta') || ''),
        note: String(f.get('note') || ''),
      };
      const error = M.usError(fields, ui.today);
      if (error) return formError(form, error);
      const id = form.dataset.id;
      if (id) M.updateUltrasound(app.state, id, fields);
      else M.addUltrasound(app.state, fields);
      persist();
      closeDialog(sheetDialog);
      render();
      toast(say(id ? 'saved' : 'ultrasound'));
    },

    checkup(form) {
      const f = new FormData(form);
      const id = form.dataset.id;
      const ck = id ? app.state.checkups.find((c) => c.id === id) : null;
      const title = String(f.get('title') || '').trim();
      const date = String(f.get('date') || '');
      const time = String(f.get('time') || '').slice(0, 5);
      const fields = {
        title,
        date: date || null,
        time: /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : '',
        items: String(f.get('items') || '').split('\n').map((s) => s.trim()).filter(Boolean),
        prep: String(f.get('prep') || '').trim(),
      };
      if (!title) return formError(form, '给这次产检起个名字吧');
      if (date && !D.isISODate(date)) return formError(form, '日期格式不对，重新选一下');
      if (!date && !(ck && ck.target != null)) return formError(form, '选一个日期吧');
      if (ck) M.updateCheckup(app.state, id, fields);
      else M.addCheckup(app.state, fields);
      persist();
      closeDialog(checkupDialog);
      render();
      toast(ck ? say('saved') : '加好了，已经按孕周排进日程');
    },

    med(form) {
      const f = new FormData(form);
      const id = form.dataset.id;
      const fields = {
        name: String(f.get('name') || '').trim(),
        kind: f.get('kind'),
        dose: String(f.get('dose') || ''),
        start: String(f.get('start') || ''),
        end: String(f.get('end') || '') || null,
        note: String(f.get('note') || ''),
      };
      const error = M.medError(fields, ui.today);
      if (error) return formError(form, error);
      if (id) M.updateMed(app.state, id, fields);
      else M.addMed(app.state, fields);
      persist();
      closeDialog(medDialog);
      render();
      toast(id ? say('saved') : `记下了「${fields.name}」`);
    },

    'bag-item'(form) {
      const name = form.elements.name.value.trim().slice(0, M.BAG_NAME_MAX);
      const error = M.bagItemError(app.state, name);
      if (error) {
        oops(error);
        form.elements.name.focus();
        return;
      }
      M.addBagItem(app.state, form.dataset.group, name);
      persist();
      ui.clearInputs.push('bag-new');
      render();
      document.getElementById('bag-new')?.focus();
    },

    ...babyForms,
  };

  const actions = {
    ...storyActions,
    ...recipeActions,
    ...babyActions,

    'open-settings': openSettings,

    'reload-app'() {
      location.reload();
    },

    'journal-start'(el) {
      ui.journalMood = el.dataset.mood;
      go('#/journal', 'j-text');
    },

    'edit-journal'(el) {
      openJournalSheet(el.dataset.id);
    },

    'delete-journal'(el) {
      const removed = J.remove(app.state, el.dataset.id);
      closeDialog(sheetDialog);
      if (!removed) return;
      persist();
      render();
      toast('删掉了这条心情', () => app.state.journal.splice(removed.index, 0, removed.entry));
    },

    'journal-more'() {
      ui.journalShown += JOURNAL_SHOWN;
      render();
    },

    'mood-care-hide'() {
      const before = app.state.prefs.moodCareHidden;
      app.state.prefs.moodCareHidden = ui.today;
      persist();
      render();
      toast('好，过几天再来问问你', () => { app.state.prefs.moodCareHidden = before; });
    },

    'close-dialog'(el) {
      closeDialog(el.closest('dialog'));
    },

    'apply-lmp'(el) {
      const form = el.closest('form');
      const lmp = form.elements.lmp.value;
      if (!D.isISODate(lmp)) return formError(form, '先选末次月经的第一天');
      const due = D.dueFromLmp(lmp);
      form.elements.dueDate.value = due;
      formError(form, '');
      form.querySelector('.lmp-hint').textContent = `推算出的预产期是 ${D.formatDate(due, { year: true, weekday: true })}，已经填到上面了。`;
    },

    'toggle-weights'() {
      ui.showAllWeights = !ui.showAllWeights;
      render();
    },

    'delete-weight'(el) {
      const removed = M.removeWeight(app.state, el.dataset.date);
      if (!removed) return;
      persist();
      render();
      toast(`删掉了 ${D.formatDate(removed.date)} 的记录`, () => M.upsertWeight(app.state, removed.date, removed.kg));
    },

    'toggle-done'(el) {
      const ck = app.state.checkups.find((c) => c.id === el.dataset.id);
      if (!ck) return;
      ck.done = !ck.done;
      if (ck.done) cheer(el);
      persist();
      render();
      toast(ck.done ? say('checkupDone', { title: ck.title }) : `「${ck.title}」改回没完成`, () => { ck.done = !ck.done; });
    },

    'mark-past-done'() {
      const rows = M.scheduleRows(app.state, ui.today).filter((r) => r.status.kind === 'past');
      rows.forEach((r) => { r.ck.done = true; });
      persist();
      render();
      toast(`${rows.length} 次产检标为完成`, () => rows.forEach((r) => { r.ck.done = false; }));
    },

    'add-checkup'() {
      openCheckupDialog(null);
    },

    'edit-checkup'(el) {
      openCheckupDialog(el.dataset.id);
    },

    'delete-checkup'(el) {
      const removed = M.removeCheckup(app.state, el.dataset.id);
      if (!removed) return;
      persist();
      closeDialog(checkupDialog);
      render();
      toast(`删掉了「${removed.ck.title}」`, () => app.state.checkups.splice(removed.index, 0, removed.ck));
    },

    'add-med'() {
      openMedDialog(null);
    },

    'edit-med'(el) {
      openMedDialog(el.dataset.id);
    },

    'delete-med'(el) {
      const removed = M.removeMed(app.state, el.dataset.id);
      if (!removed) return;
      persist();
      closeDialog(medDialog);
      render();
      toast(`删掉了「${removed.med.name}」`, () => app.state.meds.splice(removed.index, 0, removed.med));
    },

    'stop-med'(el) {
      const stopped = M.stopMed(app.state, el.dataset.id, ui.today);
      if (!stopped) return;
      persist();
      render();
      toast(`「${stopped.med.name}」记为今天停了`, () => { stopped.med.end = stopped.previous; });
    },

    'med-stage'(el) {
      ui.medStage = el.dataset.stage === ui.medStage ? 'all' : el.dataset.stage;
      render();
    },

    'med-suggest'(el) {
      const form = el.closest('form');
      form.elements.name.value = el.dataset.name;
      form.elements.kind.value = 'supplement';
      form.elements.dose.focus();
    },

    'start-kicks'() {
      M.startKicks(app.state, Date.now());
      ui.kickFeedback = '';
      persist();
      go('#/tools/kicks', 'kick-tap');
    },

    'tap-kick'() {
      const hit = M.tapKick(app.state, Date.now());
      if (hit) {
        ui.kickFeedback = hit.counted ? '上一下：算上 1 次' : '上一下：离上次不到 5 分钟，并成 1 次';
        persist();
        navigator.vibrate?.(25);
      }
      render();
    },

    'end-kicks'(el) {
      const now = Date.now();
      const k = M.endKicks(app.state, now);
      if (!k) return;
      const r = M.kickReview(app.state, now).find((x) => x.session === k);
      if (r.verdict === 'ok') cheer(el);
      ui.kickFeedback = '';
      persist();
      render();
      const message = `这次数了 ${r.minutes} 分钟，胎动 ${r.count} 次`;
      toast(r.verdict === 'ok' ? `${message}，${say('kicksDone')}` : message, () => { k.end = null; });
    },

    'delete-kicks'(el) {
      const removed = M.removeKicks(app.state, el.dataset.id);
      if (!removed) return;
      persist();
      render();
      toast('这次胎动记录删掉了', () => app.state.kicks.splice(removed.index, 0, removed.session));
    },

    'toggle-contraction'() {
      M.toggleContraction(app.state, Date.now());
      persist();
      render();
    },

    'delete-contraction'(el) {
      const removed = M.removeContraction(app.state, el.dataset.id);
      if (!removed) return;
      persist();
      render();
      toast('删掉了一条宫缩记录', () => app.state.contractions.splice(removed.index, 0, removed.contraction));
    },

    'clear-contractions'() {
      const before = app.state.contractions;
      if (!before.length) return;
      app.state.contractions = [];
      persist();
      render();
      toast('宫缩记录清空了', () => { app.state.contractions = before; });
    },

    'food-level'(el) {
      ui.foodLevel = el.dataset.level;
      render();
    },

    'delete-bp'(el) {
      const removed = M.removeBp(app.state, el.dataset.id);
      if (!removed) return;
      persist();
      render();
      toast(`删掉了 ${removed.record.sys}/${removed.record.dia} 这条`, () => app.state.bp.splice(removed.index, 0, removed.record));
    },

    'glucose-after'(el) {
      app.state.prefs.glucoseAfter = Number(el.dataset.after) === 1 ? 1 : 2;
      persist();
      render();
    },

    'edit-glucose'(el) {
      openGlucoseSheet(el.dataset.date, el.dataset.slot);
    },

    'delete-glucose'(el) {
      const removed = M.removeGlucose(app.state, el.dataset.date, el.dataset.slot);
      closeDialog(sheetDialog);
      if (!removed) return;
      persist();
      render();
      toast('删掉了这条血糖', () => M.setGlucose(app.state, removed));
    },

    'add-us'() {
      openUltrasoundSheet(null);
    },

    'edit-us'(el) {
      openUltrasoundSheet(el.dataset.id);
    },

    'delete-us'(el) {
      const removed = M.removeUltrasound(app.state, el.dataset.id);
      closeDialog(sheetDialog);
      if (!removed) return;
      persist();
      render();
      toast('删掉了这次 B 超记录', () => app.state.ultrasounds.splice(removed.index, 0, removed.record));
    },

    'toggle-bag-item'(el) {
      const item = M.toggleBagItem(app.state, el.dataset.id);
      if (!item) return;
      const complete = item.done && !M.bagSummary(app.state).left;
      if (complete) cheer(el);
      persist();
      render();
      if (complete) toast(say('bagDone'));
    },

    'add-bag-item'(el) {
      if (ui.bagAdding !== el.dataset.group) ui.clearInputs.push('bag-new');
      ui.bagAdding = el.dataset.group;
      render();
      document.getElementById('bag-new')?.focus();
    },

    'cancel-bag-item'() {
      const group = ui.bagAdding;
      ui.bagAdding = null;
      render();
      document.getElementById(`bag-add-${group}`)?.focus();
    },

    'delete-bag-item'(el) {
      const removed = M.removeBagItem(app.state, el.dataset.id);
      if (!removed) return;
      persist();
      render();
      toast(`删掉了「${removed.item.name}」`, () => app.state.bag.splice(removed.index, 0, removed.item));
    },

    'export-ics'() {
      const rows = M.scheduleRows(app.state, ui.today).filter((r) => !r.ck.done && r.status.diff >= 0);
      if (!rows.length) return toast('没有需要提醒的产检了');
      downloadCalendar(rows, '产检日程.ics');
      toast(`导出了 ${rows.length} 次产检，打开下载的文件就能加进日历`);
    },

    'export-ics-one'(el) {
      const row = M.scheduleRows(app.state, ui.today).find((r) => r.ck.id === el.dataset.id);
      if (!row || row.status.diff < 0) return oops('先填好日期，再加到日历');
      downloadCalendar([row], `产检-${row.ck.title}.ics`);
      toast('打开下载的文件就能加进日历');
    },

    async 'enable-notify'() {
      if (notifyPermission() === 'unsupported') return oops('这个浏览器不支持网页通知，用「导入日历」更稳');
      const result = await Notification.requestPermission();
      render();
      if (result === 'granted') {
        toast('好啦，页面开着时到日子会弹通知');
        checkNotifications();
      } else {
        oops('通知没打开，可以在浏览器的网站设置里允许，或者用「导入日历」');
      }
    },

    async 'export-backup'(el) {
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
      const form = settingsDialog.open ? settingsDialog.querySelector('form') : document.querySelector('form[data-form="onboard"]');
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;
        try {
          const next = S.parseBackup(await file.text());
          if (app.state && !window.confirm('导入会覆盖现在的全部记录，确定吗？')) return;
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
      input.click();
    },

    'hide-install-hint'() {
      app.state.prefs.installHintHidden = true;
      persist();
      render();
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
      if (!window.confirm('确定清空全部数据吗？清空后找不回来，建议先导出备份。')) return;
      S.clear();
      app.state = null;
      ui.bagAdding = null;
      closeDialog(settingsDialog);
      render();
    },

    undo() {
      if (!ui.undo) return;
      ui.undo();
      ui.undo = null;
      persist();
      render();
      toast('已撤销');
    },
  };

  Object.assign(app, { forms, actions });
})();
