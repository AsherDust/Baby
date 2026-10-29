(function () {
  'use strict';
  // 宝宝的按钮和面板：出生、喂奶睡觉尿布、补记和修改、身长体重、里程碑、疫苗、体温用药、辅食
  const { dates: D, baby: Bb, babyBook: BOOK, babyFood: FOOD, calendar: Cal, app } = globalThis.Baby;
  const {
    sheetDialog, settingsDialog, esc, ui, hhmm, render, showDialog, dialogHead, closeDialog, formError, toast, oops, say,
    cheer, persist, download, babyMinText, babyLogInfo, babyFoodDot
  } = app;

  const TYPE_NAMES = { breast: '亲喂', bottle: '瓶喂', food: '辅食', sleep: '睡觉', diaper: '尿布', temp: '体温', med: '用药' };
  const kid = () => app.state.baby;
  const submitButton = (form) => form.querySelector('button:not([type="button"])');
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

  // ---------- 里程碑、疫苗、辅食 ----------

  function openMilestoneSheet(id) {
    const m = BOOK.milestones.find((x) => x[0] === id);
    if (!m) return;
    const b = kid();
    const date = b.milestones[id] || '';
    sheetDialog.innerHTML = `
      <form class="dialog-body" data-form="milestone" data-id="${id}" novalidate>
        ${dialogHead(m[1], `多数宝宝 ${m[2]}–${m[3]} 个月`)}
        ${field('哪天会的', `<input type="date" name="date" min="${b.birthDate}" max="${ui.today}" value="${date || ui.today}">`)}
        <p class="form-error" hidden></p>
        <div class="dialog-actions">
          ${date ? '<button type="button" class="btn btn-quiet" data-action="milestone-clear" data-id="' + id + '">还没会</button>' : ''}
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost" data-action="close-dialog">取消</button>
          <button class="btn">记下</button>
        </div>
      </form>`;
    showDialog(sheetDialog);
  }

  function openVaccineSheet(id) {
    const r = Bb.vaccineRows(kid(), BOOK, ui.today).find((x) => x.id === id);
    if (!r) return;
    sheetDialog.innerHTML = `
      <form class="dialog-body" data-form="vaccine" data-id="${id}" novalidate>
        ${dialogHead(`${r.name}第 ${r.dose} 剂`, `${r.when} · ${D.formatDate(r.due, { year: true })}起可以打`)}
        ${field('约在哪天 <small>可选，接种门诊预约的日子</small>', `<input type="date" name="booked" value="${r.booked || ''}">`)}
        ${field('哪天打的 <small>打完了再填</small>', `<input type="date" name="done" max="${ui.today}" value="${r.done || ''}">`)}
        ${r.note ? `<p class="hint">${r.note}</p>` : ''}
        <p class="form-error" hidden></p>
        <div class="dialog-actions">
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost" data-action="close-dialog">取消</button>
          <button class="btn">保存</button>
        </div>
      </form>`;
    showDialog(sheetDialog);
  }

  function openExamSheet(id) {
    const r = Bb.examRows(kid(), BOOK, ui.today).find((x) => x.id === id);
    if (!r) return;
    sheetDialog.innerHTML = `
      <form class="dialog-body exam-sheet" data-form="exam" data-id="${id}" novalidate>
        ${dialogHead(r.name, `${D.formatDate(r.from, { year: true })}～${D.formatDate(r.to)} · ${r.who === 'both' ? '妈妈和宝宝一起' : '宝宝'}`)}
        <p class="exam-where">${r.where}</p>
        <section class="recipe-part">
          <h3>查什么</h3>
          <ul class="exam-items">${r.items.map((t) => `<li>${t}</li>`).join('')}</ul>
        </section>
        ${r.watch.length ? `
          <section class="recipe-part">
            <h3>要留意</h3>
            <p class="hint">有下面任何一条，体检时告诉医生：</p>
            <ul class="exam-watch">${r.watch.map((t) => `<li>${t}</li>`).join('')}</ul>
          </section>` : ''}
        ${r.note ? `<p class="recipe-note">${r.note}</p>` : ''}
        <div class="field-row">
          ${field('约在哪天 <small>可选</small>', `<input type="date" name="booked" value="${r.booked || ''}">`)}
          ${field('哪天做的 <small>做完了再填</small>', `<input type="date" name="done" max="${ui.today}" value="${r.done || ''}">`)}
        </div>
        <p class="form-error" hidden></p>
        <div class="dialog-actions">
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost" data-action="close-dialog">取消</button>
          <button class="btn">保存</button>
        </div>
      </form>`;
    showDialog(sheetDialog);
  }

  function openFoodSheet(id) {
    const r = FOOD.recipes.find((x) => x.id === id);
    if (!r) return;
    const b = kid();
    const months = b ? Bb.ageOf(b.birthDate, ui.today).months : null;
    const fresh = b ? Bb.newFoods(FOOD, b, r) : [];
    const stage = BOOK.foodStages.find((s) => s.from === r.stage);
    const tagName = Object.fromEntries(FOOD.tags);
    const allergenName = Object.fromEntries(FOOD.allergens);
    sheetDialog.innerHTML = `
      <div class="dialog-body recipe-sheet" data-id="${r.id}">
        ${dialogHead(`${babyFoodDot(r)}${esc(r.name)}`, `${stage.name}起 · 约 ${r.minutes} 分钟`)}
        <p class="recipe-tags">${r.good.map((g) => `<span class="tag tag-good">${tagName[g]}</span>`).join('')}${r.allergens.map((a) => `<span class="tag tag-lv-high">含${allergenName[a]}</span>`).join('')}</p>
        <section class="recipe-part">
          <h3>用料</h3>
          <ul class="recipe-items">${r.items.map(([name, amount]) => `<li><span>${esc(name)}${fresh.includes(name) ? '<span class="tag tag-next">第一次</span>' : ''}</span><b>${esc(amount)}</b></li>`).join('')}</ul>
        </section>
        <section class="recipe-part">
          <h3>做法</h3>
          <ol class="recipe-steps">${r.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        </section>
        ${r.tip ? `<p class="recipe-note"><b>小贴士</b>${esc(r.tip)}</p>` : ''}
        ${fresh.length ? '<p class="hint">第一次吃的食材先单独吃 2～3 天，看看有没有起疹子、呕吐、拉肚子，再加下一样。</p>' : ''}
        ${b && months < r.stage ? `<p class="hint">这道满 ${r.stage} 个月以后再吃。</p>` : ''}
        <div class="dialog-actions">
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost" data-action="close-dialog">关闭</button>
          ${b && months >= 6 ? `<button type="button" class="btn" data-action="baby-food-log" data-id="${r.id}">吃了，记一笔</button>` : ''}
        </div>
      </div>`;
    showDialog(sheetDialog);
  }

  // ---------- 按钮和表单 ----------

  /** 记一条以后：保存、重画、提示可以撤销 */
  function saved(message, undo) {
    persist();
    render();
    toast(message, undo);
  }

  function logMessage(e) {
    const info = babyLogInfo(e, Date.now());
    return `${info.name}记好了：${info.text.replace(/<[^>]+>/g, '')}`;
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
      closeDialog(sheetDialog);
      if (first) {
        ui.babyDay = 0;
        if (location.hash && location.hash !== '#/') location.hash = '#/';
      }
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
      closeDialog(sheetDialog);
      saved(id ? say('saved') : logMessage(entry), id ? null : () => Bb.removeLog(b, entry.id));
    },

    'baby-growth'(form) {
      const b = kid();
      const f = Object.fromEntries(new FormData(form));
      const error = Bb.growthError(b, f, ui.today);
      if (error) return formError(form, error);
      const before = Bb.setGrowth(b, f);
      ui.clearInputs.push('g-weight', 'g-length', 'g-head', 'g-date');
      saved(say('growth'), () => {
        Bb.removeGrowth(b, f.date);
        if (before) b.growth = b.growth.concat(before).sort((x, y) => (x.date < y.date ? -1 : 1));
      });
    },

    milestone(form) {
      const b = kid();
      const date = form.elements.date.value;
      if (!D.isISODate(date) || date > ui.today || date < b.birthDate) return formError(form, '选一下哪天会的');
      const id = form.dataset.id;
      const before = b.milestones[id] || null;
      cheer(submitButton(form));
      b.milestones[id] = date;
      closeDialog(sheetDialog);
      const name = BOOK.milestones.find((m) => m[0] === id)[1];
      saved(say('milestone', { name }), () => {
        if (before) b.milestones[id] = before;
        else delete b.milestones[id];
      });
    },

    'baby-moment'(form) {
      const b = kid();
      const name = form.elements.name.value.trim();
      const date = form.elements.date.value;
      if (!name) return formError(form, '写一下是什么第一次');
      if (!D.isISODate(date) || date > ui.today || date < b.birthDate) return formError(form, '选一下哪天');
      const m = Bb.addMoment(b, name, date);
      ui.clearInputs.push('mo-name');
      saved(say('milestone', { name: m.name }), () => { b.moments = b.moments.filter((x) => x.id !== m.id); });
    },

    vaccine(form) {
      const b = kid();
      const booked = form.elements.booked.value;
      const done = form.elements.done.value;
      if (done && (!D.isISODate(done) || done > ui.today)) return formError(form, '打完的日子不能晚于今天');
      if (booked && !D.isISODate(booked)) return formError(form, '约的日子格式不对，重新选一下');
      const id = form.dataset.id;
      const before = b.vaccines[id] ? { ...b.vaccines[id] } : null;
      Bb.setVaccine(b, id, { booked: booked || null, done: done || null });
      closeDialog(sheetDialog);
      saved(done ? say('vaccine') : booked ? `约好了，${D.formatDate(booked, { weekday: true })}` : say('saved'), () => {
        if (before) b.vaccines[id] = before;
        else delete b.vaccines[id];
      });
    },

    exam(form) {
      const b = kid();
      const booked = form.elements.booked.value;
      const done = form.elements.done.value;
      if (done && (!D.isISODate(done) || done > ui.today)) return formError(form, '做完的日子不能晚于今天');
      if (booked && !D.isISODate(booked)) return formError(form, '约的日子格式不对，重新选一下');
      const id = form.dataset.id;
      const before = b.exams[id] ? { ...b.exams[id] } : null;
      const name = (BOOK.exams.find((e) => e.id === id) || {}).name || '体检';
      Bb.setExam(b, id, { booked: booked || null, done: done || null });
      closeDialog(sheetDialog);
      saved(done ? say('exam', { name }) : booked ? `约好了，${D.formatDate(booked, { weekday: true })}` : say('saved'), () => {
        if (before) b.exams[id] = before;
        else delete b.exams[id];
      });
    },

    'extra-vaccine'(form) {
      const b = kid();
      const name = form.elements.name.value.trim();
      const date = form.elements.date.value;
      const done = form.elements.done.checked;
      if (!name) return formError(form, '写一下是什么疫苗');
      if (!D.isISODate(date) || (done && date > ui.today)) return formError(form, done ? '打完的日子不能晚于今天' : '选一下约的日子');
      const v = Bb.addExtraVaccine(b, { name, date, done });
      ui.clearInputs.push('xv-name');
      saved(done ? say('vaccine') : `「${v.name}」约好了`, () => { b.extraVaccines = b.extraVaccines.filter((x) => x.id !== v.id); });
    },

    'baby-temp'(form) {
      const b = kid();
      const now = Date.now();
      const read = Bb.readLog('temp', { date: Bb.dayOf(now), time: hhmm(now), value: form.elements.value.value, site: form.elements.site.value }, now);
      if (read.error) return formError(form, read.error);
      const e = Bb.addLog(b, read);
      ui.clearInputs.push('bt-value');
      const level = Bb.tempLevel(BOOK, e.value, e.site);
      saved(Bb.isFever(level) ? `${e.value}℃ 记下了，有点发热，注意看下面的提醒` : `${e.value}℃ 记下了`, () => Bb.removeLog(b, e.id));
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
      const before = app.state.baby;
      app.state.baby = null;
      persist();
      closeDialog(sheetDialog);
      location.hash = '#/';
      render();
      toast('宝宝的信息清掉了', () => { app.state.baby = before; });
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

    'growth-metric'(el) {
      ui.growthMetric = el.dataset.metric;
      ui.focusNext = el.id;
      render();
    },

    'growth-delete'(el) {
      const b = kid();
      const removed = Bb.removeGrowth(b, el.dataset.date);
      if (!removed) return;
      saved(`删掉了 ${D.formatDate(removed.date)} 的这次`, () => {
        b.growth = b.growth.concat(removed).sort((x, y) => (x.date < y.date ? -1 : 1));
      });
    },

    'milestone-open'(el) {
      openMilestoneSheet(el.dataset.id);
    },

    'milestone-clear'(el) {
      const b = kid();
      const before = b.milestones[el.dataset.id];
      delete b.milestones[el.dataset.id];
      closeDialog(sheetDialog);
      saved('改回还没会了', () => { b.milestones[el.dataset.id] = before; });
    },

    'moment-delete'(el) {
      const b = kid();
      const index = b.moments.findIndex((m) => m.id === el.dataset.id);
      if (index < 0) return;
      const [m] = b.moments.splice(index, 1);
      saved(`删掉了「${m.name}」`, () => b.moments.splice(index, 0, m));
    },

    'vaccine-done'(el) {
      const b = kid();
      const id = el.dataset.id;
      const before = b.vaccines[id] ? { ...b.vaccines[id] } : null;
      cheer(el);
      Bb.setVaccine(b, id, { done: ui.today });
      saved(say('vaccine'), () => {
        if (before) b.vaccines[id] = before;
        else delete b.vaccines[id];
      });
    },

    'vaccine-open'(el) {
      openVaccineSheet(el.dataset.id);
    },

    'vaccine-ics'() {
      const b = kid();
      // 已经可以打、还没约的，提醒放在今天
      const rows = Bb.vaccineRows(b, BOOK, ui.today).filter((r) => r.status !== 'done')
        .map((r) => (r.booked && r.booked >= ui.today ? r : { ...r, booked: null, due: r.due < ui.today ? ui.today : r.due }));
      if (!rows.length) return oops('没有要提醒的疫苗了');
      download(Cal.build(rows.map((r) => Cal.vaccineEvent(r, b.name)), new Date(), '疫苗接种'), '疫苗接种.ics', 'text/calendar;charset=utf-8');
      toast(`导出了 ${rows.length} 针，打开下载的文件就能加进日历`);
    },

    'paper-toggle'(el) {
      const b = kid();
      const p = BOOK.papers.find((x) => x.id === el.dataset.id);
      if (!b || !p) return;
      const before = Bb.togglePaper(b, p.id, ui.today);
      const all = Bb.paperRows(b, BOOK, ui.today).every((r) => r.done);
      if (!before && all) cheer(el);
      saved(before ? `「${p.name}」改回还没办` : say(all ? 'papersDone' : 'paper', { name: p.name }), () => {
        if (before) b.papers[p.id] = before;
        else delete b.papers[p.id];
      });
    },

    'exam-done'(el) {
      const b = kid();
      const id = el.dataset.id;
      const before = b.exams[id] ? { ...b.exams[id] } : null;
      const name = (BOOK.exams.find((e) => e.id === id) || {}).name || '体检';
      cheer(el);
      Bb.setExam(b, id, { done: ui.today });
      saved(say('exam', { name }), () => {
        if (before) b.exams[id] = before;
        else delete b.exams[id];
      });
    },

    'exam-open'(el) {
      openExamSheet(el.dataset.id);
    },

    'exam-past-done'() {
      const b = kid();
      const before = Bb.markPastExams(b, BOOK, ui.today);
      saved('过了时间的都记成做过了', () => { b.exams = before; });
    },

    'exam-ics'() {
      const b = kid();
      // 已经可以去、还没约的，提醒放在今天
      const rows = Bb.examRows(b, BOOK, ui.today).filter((r) => r.status !== 'done' && r.status !== 'late')
        .map((r) => (r.booked && r.booked >= ui.today ? r : { ...r, booked: null, from: r.from < ui.today ? ui.today : r.from }));
      if (!rows.length) return oops('没有要提醒的体检了');
      download(Cal.build(rows.map((r) => Cal.examEvent(r, b.name)), new Date(), '儿保体检'), '儿保体检.ics', 'text/calendar;charset=utf-8');
      toast(`导出了 ${rows.length} 次体检，打开下载的文件就能加进日历`);
    },

    'extra-vaccine-done'(el) {
      const v = kid().extraVaccines.find((x) => x.id === el.dataset.id);
      if (!v) return;
      const before = { ...v };
      v.done = true;
      if (v.date > ui.today) v.date = ui.today;
      saved(say('vaccine'), () => Object.assign(v, before));
    },

    'extra-vaccine-delete'(el) {
      const b = kid();
      const index = b.extraVaccines.findIndex((x) => x.id === el.dataset.id);
      if (index < 0) return;
      const [v] = b.extraVaccines.splice(index, 1);
      saved(`删掉了「${v.name}」`, () => b.extraVaccines.splice(index, 0, v));
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

    'baby-food-open'(el) {
      openFoodSheet(el.dataset.id);
    },

    'baby-food-log'(el) {
      const b = kid();
      const r = FOOD.recipes.find((x) => x.id === el.dataset.id);
      if (!r) return;
      const fresh = Bb.newFoods(FOOD, b, r);
      const tried = { ...b.tried };
      const e = Bb.addLog(b, { type: 'food', start: Date.now(), text: r.name, amount: '', recipe: r.id, note: '' });
      Bb.markTried(FOOD, b, r, ui.today);
      closeDialog(sheetDialog);
      saved(fresh.length ? `记下了。第一次吃${fresh.join('、')}，这两三天留意一下` : `${r.name}记好了`, () => {
        Bb.removeLog(b, e.id);
        b.tried = tried;
      });
    },

    'tried-toggle'(el) {
      Bb.toggleTried(kid(), el.dataset.food, ui.today);
      persist();
      ui.triedOpen = true;
      ui.focusNext = el.id;
      render();
    },
  };

  Object.assign(app, { babyForms, babyActions, openBirthSheet });
})();
