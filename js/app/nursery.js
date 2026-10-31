(function () {
  'use strict';
  // 宝宝的按钮和面板：出生、喂奶睡觉尿布、补记和修改、存奶、体温用药；身长体重、里程碑、牙齿、疫苗、体检、辅食的在 nursery-care.js
  const { dates: D, model: M, baby: Bb, babyBook: BOOK, babyFood: FOOD, app } = globalThis.Baby;
  const {
    sheetDialog, settingsDialog, esc, ui, hhmm, render, showDialog, dialogHead, closeDialog, formError, toast, say,
    cheer, persist, submitButton, babyMinText, babyLogInfo
  } = app;

  const TYPE_NAMES = { breast: '亲喂', bottle: '瓶喂', pump: '吸奶', food: '辅食', sleep: '睡觉', diaper: '尿布', temp: '体温', med: '用药' };
  const kid = () => app.state.baby;
  const radio = (name, value, label, checked) => `<label><input type="radio" name="${name}" value="${value}"${checked ? ' checked' : ''}><span>${label}</span></label>`;
  const field = (label, input) => `<label class="field"><span>${label}</span>${input}</label>`;

  // ---------- 出生 ----------

  function openBirthSheet() {
    const b = kid();
    const birth = b ? b.growth.find((g) => g.date === b.birthDate) || {} : {};
    const v = (k) => (birth[k] == null ? '' : birth[k]);
    sheetDialog.innerHTML = `
      <form class="dialog-body" data-form="baby-birth" novalidate>
        ${dialogHead(b ? '宝宝信息' : '宝宝出生啦', b ? '' : '恭喜！记下这几样，蜜罐就换成宝宝的一天')}
        <div class="field-row">
          ${field('小名 <small>可选</small>', `<input name="name" maxlength="12" autocomplete="off" placeholder="例如 豆豆" value="${esc(b ? b.name : app.state.profile.nickname)}">`)}
          <div class="field"><span>是</span><div class="seg" role="radiogroup" aria-label="性别">${Bb.SEXES.map((s) => radio('sex', s.id, s.name, b && b.sex === s.id)).join('')}</div></div>
        </div>
        <div class="field-row">
          ${field('出生日期', `<input type="date" name="birthDate" max="${ui.today}" value="${b ? b.birthDate : ui.today}">`)}
          ${field('出生时间 <small>可选</small>', `<input type="time" name="birthTime" value="${b ? b.birthTime : ''}">`)}
        </div>
        <div class="field-row field-row-3">
          ${field('体重 <small>kg</small>', `<input name="weight" inputmode="decimal" autocomplete="off" placeholder="3.3" value="${v('weight')}">`)}
          ${field('身长 <small>cm</small>', `<input name="length" inputmode="decimal" autocomplete="off" placeholder="50" value="${v('length')}">`)}
          ${field('头围 <small>cm</small>', `<input name="head" inputmode="decimal" autocomplete="off" placeholder="34" value="${v('head')}">`)}
        </div>
        <p class="hint">出生时的体重身长写在出生证明上，可以先空着，以后在「成长」里补。</p>
        <p class="form-error" hidden></p>
        <div class="dialog-actions">
          ${b ? '<button type="button" class="btn btn-quiet" data-action="baby-clear">清除宝宝信息</button>' : ''}
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost" data-action="close-dialog">取消</button>
          <button class="btn">保存</button>
        </div>
      </form>`;
    showDialog(sheetDialog);
  }

  const birthFields = (form) => {
    const f = Object.fromEntries(new FormData(form));
    return { name: f.name || '', sex: f.sex || '', birthDate: f.birthDate || '', birthTime: f.birthTime || '', weight: f.weight, length: f.length, head: f.head };
  };

  // ---------- 补记和修改 ----------

  /** 当天的面板；type 换了就重新画，填过的日期和时间留着 */
  function openLogSheet(type, id = '', date = '') {
    const b = kid();
    const e = id ? b.logs.find((l) => l.id === id) : null;
    if (id && !e) return;
    const now = Date.now();
    const day = e ? Bb.dayOf(e.start) : date || ui.today;
    const time = e ? hhmm(e.start) : day === ui.today ? hhmm(now) : '12:00';
    const val = (k, d = '') => (e && e[k] != null ? e[k] : d);
    const fields = {
      breast: () => `
        <div class="field-row">
          ${field('左边 <small>分钟</small>', `<input name="left" inputmode="numeric" autocomplete="off" placeholder="10" value="${e ? Math.round(e.left / 60) || '' : ''}">`)}
          ${field('右边 <small>分钟</small>', `<input name="right" inputmode="numeric" autocomplete="off" placeholder="10" value="${e ? Math.round(e.right / 60) || '' : ''}">`)}
        </div>`,
      bottle: () => `
        ${field('喝了多少 <small>毫升</small>', `<input id="sheet-ml" name="ml" inputmode="numeric" autocomplete="off" placeholder="90" value="${val('ml')}">`)}
        <div class="suggest"><span>常用：</span>${[60, 90, 120, 150, 180].map((n) => `<button type="button" class="chip" data-action="baby-ml" data-ml="${n}">${n}</button>`).join('')}</div>
        <div class="seg" role="radiogroup" aria-label="喝的什么">${Bb.MILKS.map((m) => radio('milk', m.id, m.name, val('milk', 'formula') === m.id)).join('')}</div>`,
      food: () => `
        ${field('吃了什么', `<input name="text" maxlength="40" autocomplete="off" placeholder="例如 南瓜泥" value="${esc(val('text'))}">`)}
        ${field('吃了多少 <small>可选</small>', `<input name="amount" maxlength="20" autocomplete="off" placeholder="例如 半碗、5 勺" value="${esc(val('amount'))}">`)}
        <input type="hidden" name="recipe" value="${esc(val('recipe'))}">`,
      pump: () => `
        <div class="field-row">
          ${field('左边 <small>毫升</small>', `<input name="left" inputmode="numeric" autocomplete="off" placeholder="60" value="${e ? e.left || '' : ''}">`)}
          ${field('右边 <small>毫升</small>', `<input name="right" inputmode="numeric" autocomplete="off" placeholder="60" value="${e ? e.right || '' : ''}">`)}
        </div>
        ${e ? '' : `
          <div class="stash-pick">
            <label class="pick"><input type="checkbox" name="store" checked><span>存起来</span></label>
            <div class="seg" role="radiogroup" aria-label="放哪">${Bb.STASH_PLACES.map((p, i) => radio('place', p.id, p.name, !i)).join('')}</div>
          </div>`}`,
      sleep: () => `${field('几点醒的 <small>还在睡就空着</small>', `<input type="time" name="endTime" value="${e && e.end ? hhmm(e.end) : ''}">`)}`,
      diaper: () => `
        <div class="pick-row" role="group" aria-label="尿还是便">
          <label class="pick"><input type="checkbox" name="pee"${!e || e.pee ? ' checked' : ''}><span>尿</span></label>
          <label class="pick"><input type="checkbox" name="poo"${e && e.poo ? ' checked' : ''}><span>便</span></label>
        </div>
        <div class="field"><span>便的颜色 <small>可选</small></span>
          <div class="pick-row" role="radiogroup" aria-label="便的颜色">${BOOK.pooColors.map(([cid, name]) => `<label class="pick pick-poo pick-${cid}"><input type="radio" name="color" value="${cid}"${val('color') === cid ? ' checked' : ''}><span>${name}</span></label>`).join('')}</div>
        </div>`,
      temp: () => `
        ${field('体温 <small>℃</small>', `<input name="value" inputmode="decimal" autocomplete="off" placeholder="36.8" value="${val('value')}">`)}
        <div class="seg" role="radiogroup" aria-label="量的哪里">${BOOK.feverSites.map(([sid, name]) => radio('site', sid, name, val('site', 'armpit') === sid)).join('')}</div>`,
      med: () => `
        <div class="field-row">
          ${field('药名', `<input name="name" maxlength="20" autocomplete="off" placeholder="例如 维生素 D" value="${esc(val('name'))}">`)}
          ${field('剂量 <small>可选</small>', `<input name="dose" maxlength="20" autocomplete="off" placeholder="例如 1 粒" value="${esc(val('dose'))}">`)}
        </div>`,
    };
    const types = e ? '' : `
      <div class="recipe-chips" role="group" aria-label="记什么">
        ${Object.entries(TYPE_NAMES).map(([t, name]) => `<button type="button" class="chip" data-action="baby-log-type" data-type="${t}" aria-pressed="${t === type}">${name}</button>`).join('')}
      </div>`;
    const startLabel = { breast: '几点开始喂的', sleep: '几点睡着的' }[type] || '几点';
    sheetDialog.innerHTML = `
      <form class="dialog-body" data-form="baby-log" data-type="${type}" data-id="${id}" novalidate>
        ${dialogHead(e ? `改一改这条${TYPE_NAMES[type]}` : '补记一条', e ? `${D.formatDate(day, { weekday: true, relativeTo: ui.today })} ${time}` : '')}
        ${types}
        <div class="field-row">
          ${field('哪天', `<input type="date" name="date" min="${b.birthDate}" max="${ui.today}" value="${day}">`)}
          ${field(startLabel, `<input type="time" name="time" value="${time}">`)}
        </div>
        ${fields[type]()}
        ${field('备注 <small>可选</small>', `<input name="note" maxlength="100" autocomplete="off" value="${esc(val('note'))}">`)}
        <p class="form-error" hidden></p>
        <div class="dialog-actions">
          ${e ? `<button type="button" class="btn btn-quiet" data-action="baby-delete" data-id="${e.id}">删除</button>` : ''}
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost" data-action="close-dialog">取消</button>
          <button class="btn">保存</button>
        </div>
      </form>`;
    showDialog(sheetDialog);
  }

  function logFields(form) {
    const f = Object.fromEntries(new FormData(form));
    return { ...f, pee: f.pee === 'on', poo: f.poo === 'on' };
  }

  // ---------- 按钮和表单 ----------

  /** 记一条以后：保存、重画、提示可以撤销 */
  function saved(message, undo) {
    persist();
    render();
    toast(message, undo);
  }

  // info.text 是转义过的 HTML，提示条会再转义一次，先变回纯文字
  function logMessage(e) {
    const info = babyLogInfo(e, Date.now());
    const t = document.createElement('template');
    t.innerHTML = info.text;
    return `${info.name}记好了：${t.content.textContent}`;
  }

  const babyForms = {
    'baby-birth'(form) {
      const f = birthFields(form);
      const error = Bb.birthError(f, ui.today, app.state.profile.dueDate);
      if (error) return formError(form, error);
      const first = !kid();
      if (first) {
        cheer(submitButton(form));
        app.state.baby = Bb.born(f);
      } else {
        Bb.updateBirth(kid(), f);
      }
      if (f.name) app.state.profile.nickname = f.name.trim().slice(0, 12);
      persist();
      if (first) ui.babyDay = 0;
      closeDialog(sheetDialog, first && location.hash && location.hash !== '#/' ? '#/' : '');
      render();
      toast(first ? say('born') : say('saved'));
    },

    'baby-log'(form) {
      const b = kid();
      const type = form.dataset.type;
      const read = Bb.readLog(type, logFields(form), Date.now());
      if (read.error) return formError(form, read.error);
      const id = form.dataset.id;
      let entry;
      if (id) {
        entry = Bb.updateLog(b, id, read);
      } else {
        entry = Bb.addLog(b, read);
      }
      const recipe = type === 'food' && read.recipe ? FOOD.recipes.find((r) => r.id === read.recipe) : null;
      if (recipe) Bb.markTried(FOOD, b, recipe, Bb.dayOf(read.start));
      const bag = type === 'pump' && !id && form.elements.store && form.elements.store.checked
        ? Bb.addStash(b, { ml: read.left + read.right, at: read.start, place: form.elements.place.value }) : null;
      closeDialog(sheetDialog);
      saved(id ? say('saved') : `${logMessage(entry)}${bag ? `，存进${bag.place === 'freezer' ? '冷冻' : '冷藏'}了` : ''}`, id ? null : () => {
        Bb.removeLog(b, entry.id);
        if (bag) Bb.removeStash(b, bag.id);
      });
    },

    'stash-add'(form) {
      const b = kid();
      const f = Object.fromEntries(new FormData(form));
      const bag = Bb.addStash(b, { ml: f.ml, at: Date.now(), place: f.place });
      if (!bag) return formError(form, '这袋多少毫升？填 5–500 之间的数');
      ui.clearInputs.push('stash-ml');
      saved(`存了一袋 ${bag.ml} 毫升（${bag.place === 'freezer' ? '冷冻' : '冷藏'}）`, () => Bb.removeStash(b, bag.id));
    },

    'baby-temp'(form) {
      const b = kid();
      const now = Date.now();
      const read = Bb.readLog('temp', { date: Bb.dayOf(now), time: hhmm(now), value: form.elements.value.value, site: form.elements.site.value }, now);
      if (read.error) return formError(form, read.error);
      const e = Bb.addLog(b, read);
      ui.clearInputs.push('bt-value');
      const level = Bb.tempOf(BOOK, b, e);
      const note = Bb.isFever(level) ? '，有点发热，注意看下面的提醒' : level === 'cool' ? '，有点偏低，注意看下面的提醒' : '';
      saved(`${e.value}℃ 记下了${note}`, () => Bb.removeLog(b, e.id));
    },

    'baby-med'(form) {
      const b = kid();
      const now = Date.now();
      const read = Bb.readLog('med', { date: Bb.dayOf(now), time: hhmm(now), name: form.elements.name.value, dose: form.elements.dose.value }, now);
      if (read.error) return formError(form, read.error);
      const e = Bb.addLog(b, read);
      ui.clearInputs.push('bm-name', 'bm-dose');
      saved(`${e.name} 记下了`, () => Bb.removeLog(b, e.id));
    },
  };

  const babyActions = {
    'baby-birth-open'() {
      if (settingsDialog.open) closeDialog(settingsDialog);
      openBirthSheet();
    },

    'baby-clear'() {
      if (!window.confirm('清除宝宝信息会删掉宝宝的全部记录，回到孕期的样子，确定吗？建议先导出备份。')) return;
      const before = M.clearBaby(app.state);
      persist();
      closeDialog(sheetDialog, '#/');
      render();
      toast('宝宝的信息清掉了', () => M.restoreBaby(app.state, before));
    },

    'baby-breast'(el) {
      const b = kid();
      Bb.startBreast(b, el.dataset.side, Date.now());
      persist();
      ui.focusNext = 'breast-stop';
      render();
    },

    'baby-breast-stop'() {
      const e = Bb.stopBreast(kid(), Date.now());
      if (!e) return;
      ui.focusNext = 'breast-left';
      saved(logMessage(e));
    },

    'baby-sleep'() {
      const b = kid();
      const now = Date.now();
      if (Bb.running(b, 'sleep')) {
        const e = Bb.stopSleep(b, now);
        ui.focusNext = 'sleep-toggle';
        return saved(`睡了 ${babyMinText(Math.max(1, Math.round((e.end - e.start) / 60000)))}，醒啦`);
      }
      Bb.startSleep(b, now);
      persist();
      ui.focusNext = 'sleep-toggle';
      render();
    },

    'baby-diaper'(el) {
      const b = kid();
      const e = Bb.quickDiaper(b, el.dataset.what, Date.now());
      ui.focusNext = el.id;
      saved(say('diaper'), () => Bb.removeLog(b, e.id));
    },

    'baby-log'(el) {
      openLogSheet(el.dataset.type, '', el.dataset.date || '');
    },

    'baby-log-type'(el) {
      const form = sheetDialog.querySelector('form[data-form="baby-log"]');
      const date = form ? form.elements.date.value : '';
      const time = form ? form.elements.time.value : '';
      openLogSheet(el.dataset.type, '', date);
      const next = sheetDialog.querySelector('form[data-form="baby-log"]');
      if (time) next.elements.time.value = time;
    },

    'baby-ml'(el) {
      const input = document.getElementById('sheet-ml');
      if (input) input.value = el.dataset.ml;
    },

    'baby-edit'(el) {
      const e = kid().logs.find((l) => l.id === el.dataset.id);
      if (e) openLogSheet(e.type, e.id);
    },

    'baby-delete'(el) {
      const b = kid();
      const removed = Bb.removeLog(b, el.dataset.id);
      if (!removed) return;
      closeDialog(sheetDialog);
      saved(`删掉了这条${TYPE_NAMES[removed.entry.type]}`, () => Bb.restoreLog(b, removed));
    },

    'baby-day'(el) {
      const min = -Bb.ageOf(kid().birthDate, ui.today).days;
      ui.babyDay = Math.max(min, Math.min(0, ui.babyDay + Number(el.dataset.step)));
      ui.focusNext = el.id;
      render();
    },

    'stash-use'(el) {
      const b = kid();
      const used = Bb.useStash(b, el.dataset.id, Date.now());
      if (!used) return;
      saved(`用掉了一袋 ${used.bag.ml} 毫升，记成一次瓶喂`, () => {
        Bb.removeLog(b, used.log.id);
        Bb.restoreStash(b, used);
      });
    },

    'stash-thaw'(el) {
      const b = kid();
      const bag = Bb.thawStash(b, el.dataset.id, Date.now());
      if (!bag) return;
      saved('拿去解冻了，解冻后 24 小时内用完', () => { bag.thawedAt = null; });
    },

    'stash-drop'(el) {
      const b = kid();
      const removed = Bb.removeStash(b, el.dataset.id);
      if (!removed) return;
      saved(`倒掉了一袋 ${removed.bag.ml} 毫升`, () => Bb.restoreStash(b, removed));
    },

    'baby-med-fill'(el) {
      const name = document.getElementById('bm-name');
      if (name) name.value = el.dataset.name;
      document.getElementById('bm-dose')?.focus();
    },

    'vitd-done'(el) {
      const b = kid();
      const e = Bb.addLog(b, { type: 'med', start: Date.now(), name: '维生素 D', dose: '', note: '' });
      cheer(el);
      saved('今天的维生素 D 记下了', () => Bb.removeLog(b, e.id));
    },

    'trend-metric'(el) {
      ui.trendMetric = el.dataset.metric;
      ui.focusNext = el.id;
      render();
    },

  };

  Object.assign(app, { babyForms, babyActions, babySaved: saved, babyRadio: radio, babyField: field });
})();
