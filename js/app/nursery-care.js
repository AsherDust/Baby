(function () {
  'use strict';
  // 宝宝成长和健康的面板和按钮：身长体重、里程碑和其它的第一次、牙齿、疫苗、体检、办证清单、辅食和食材反应
  const { dates: D, baby: Bb, babyBook: BOOK, babyFood: FOOD, calendar: Cal, art: A, app } = globalThis.Baby;
  const {
    sheetDialog, esc, ui, render, showDialog, dialogHead, closeDialog, formError, toast, oops, say, cheer, persist, download, submitButton,
    babyFoodDot, babySaved: saved, babyRadio: radio, babyField: field,
  } = app;

  const kid = () => app.state.baby;

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

  function openToothSheet(id) {
    const b = kid();
    const r = Bb.teethRows(b, BOOK, ui.today).find((x) => x.id === id);
    if (!r) return;
    sheetDialog.innerHTML = `
      <form class="dialog-body" data-form="tooth" data-id="${id}" novalidate>
        ${dialogHead(r.name, `一般 ${r.from}～${r.to} 个月长`)}
        ${field('哪天看到长出来的', `<input type="date" name="date" min="${b.birthDate}" max="${ui.today}" value="${r.date || ui.today}">`)}
        <p class="form-error" hidden></p>
        <div class="dialog-actions">
          ${r.date ? `<button type="button" class="btn btn-quiet" data-action="tooth-clear" data-id="${id}">还没长</button>` : ''}
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

  /** 吃过的一样食材：爱吃、不爱吃、有反应，记一句；也能改回没吃过 */
  function openTriedSheet(name) {
    const b = kid();
    if (!b || !b.tried[name]) return;
    const fn = b.foodNotes[name] || {};
    sheetDialog.innerHTML = `
      <form class="dialog-body" data-form="food-feel" data-food="${esc(name)}" novalidate>
        ${dialogHead(esc(name), `${D.formatDate(b.tried[name], { year: true })}第一次吃`)}
        <div class="seg seg-wide" role="radiogroup" aria-label="吃得怎么样">${[{ id: '', name: '不标' }, ...Bb.FEELS].map((f) => radio('feel', f.id, f.name, (fn.feel || '') === f.id)).join('')}</div>
        ${field('记一句 <small>可选</small>', `<input id="feel-note" name="note" maxlength="40" autocomplete="off" placeholder="比如 嘴边起了小红点" value="${esc(fn.note || '')}">`)}
        <div class="suggest"><span>常见反应：</span>${['起疹子', '嘴边发红', '吐了', '拉肚子'].map((t) => `<button type="button" class="chip" data-action="feel-fill" data-text="${t}">${t}</button>`).join('')}</div>
        <p class="hint">有反应时先停掉这样食物，问过医生再试；呼吸困难、嘴唇或脸肿起来、一直吐、精神不好，马上去医院。不爱吃的不用硬喂，隔几天换个做法再试试。</p>
        <p class="form-error" hidden></p>
        <div class="dialog-actions">
          <button type="button" class="btn btn-quiet" data-action="tried-clear" data-food="${esc(name)}">没吃过</button>
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
        ${b && Bb.reactionsIn(b, r).length ? `<p class="recipe-warn">${A.icon.alert}<span>宝宝吃${Bb.reactionsIn(b, r).map(esc).join('、')}有过反应，这道先别做，问过医生再说。</span></p>` : ''}
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

  const babyCareForms = {
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

    'food-feel'(form) {
      const b = kid();
      const name = form.dataset.food;
      if (!b.tried[name]) return;
      const f = Object.fromEntries(new FormData(form));
      const before = b.foodNotes[name] ? { ...b.foodNotes[name] } : null;
      Bb.setFoodNote(b, name, f.feel || '', f.note || '', ui.today);
      closeDialog(sheetDialog);
      ui.triedOpen = true;
      const reaction = b.foodNotes[name] && b.foodNotes[name].feel === 'reaction';
      saved(reaction ? `记下了，含${name}的辅食先不推荐了` : say('saved'), () => {
        if (before) b.foodNotes[name] = before;
        else delete b.foodNotes[name];
      });
    },

    tooth(form) {
      const b = kid();
      const date = form.elements.date.value;
      if (!D.isISODate(date) || date > ui.today || date < b.birthDate) return formError(form, '选一下哪天，不能早于出生、晚于今天');
      const id = form.dataset.id;
      const milestone = b.milestones.tooth;
      const first = !Object.keys(b.teeth).length;
      const before = Bb.setTooth(b, id, date);
      closeDialog(sheetDialog);
      if (first) cheer(document.querySelector('.baby-teeth'));
      saved(first ? '第一颗牙！记下了' : `记下了，长了 ${Object.keys(b.teeth).length} 颗`, () => {
        Bb.setTooth(b, id, before);
        if (milestone) b.milestones.tooth = milestone;
        else delete b.milestones.tooth;
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
  };

  const babyCareActions = {
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
      const removed = Bb.removeMoment(b, el.dataset.id);
      if (!removed) return;
      saved(`删掉了「${removed.item.name}」`, () => b.moments.splice(removed.index, 0, removed.item));
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
      const removed = Bb.removeExtraVaccine(b, el.dataset.id);
      if (!removed) return;
      saved(`删掉了「${removed.item.name}」`, () => b.extraVaccines.splice(removed.index, 0, removed.item));
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

    'tooth-open'(el) {
      openToothSheet(el.dataset.id);
    },

    'tooth-clear'(el) {
      const b = kid();
      const milestone = b.milestones.tooth;
      const before = Bb.setTooth(b, el.dataset.id, null);
      closeDialog(sheetDialog);
      saved('改回还没长了', () => {
        Bb.setTooth(b, el.dataset.id, before);
        if (milestone) b.milestones.tooth = milestone;
      });
    },

    'tried-open'(el) {
      openTriedSheet(el.dataset.food);
    },

    'feel-fill'(el) {
      const note = document.getElementById('feel-note');
      if (note) note.value = el.dataset.text;
      const reaction = sheetDialog.querySelector('input[name="feel"][value="reaction"]');
      if (reaction) reaction.checked = true;
    },

    'tried-clear'(el) {
      const b = kid();
      const name = el.dataset.food;
      const tried = b.tried[name];
      const note = b.foodNotes[name];
      delete b.tried[name];
      delete b.foodNotes[name];
      closeDialog(sheetDialog);
      ui.triedOpen = true;
      saved(`「${name}」改回没吃过了`, () => {
        if (tried) b.tried[name] = tried;
        if (note) b.foodNotes[name] = note;
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

  Object.assign(app, { babyCareForms, babyCareActions });
})();
