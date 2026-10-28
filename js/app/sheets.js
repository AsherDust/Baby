(function () {
  'use strict';
  // 弹窗和底部面板
  const { dates: D, content: C, model: M, journal: J, art: A, app } = globalThis.Baby;
  const {
    settingsDialog, checkupDialog, medDialog, sheetDialog, DIALOGS, esc, atRisk, ui, glText, usText, profileFields,
    moodPicker
  } = app;

  // 弹窗打开时往历史里压一条，手机上按返回键（或侧滑返回）就是关弹窗，而不是退出页面
  let backPending = false;

  function showDialog(dialog) {
    if (!dialog.open) dialog.showModal();
    if (history.state && history.state.sheet) return;
    try {
      history.pushState({ sheet: true }, '');
    } catch (e) {
      // 个别浏览器在 file:// 下不让改历史，关弹窗照样能用按钮
    }
  }

  function onDialogClose() {
    // 自己关的和 close 事件（按 Esc 时）都会走到这里，只退一步
    if (backPending || DIALOGS.some((d) => d.open) || !(history.state && history.state.sheet)) return;
    backPending = true;
    history.back();
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (dialog.open) dialog.close();
    onDialogClose();
  }

  window.addEventListener('popstate', () => {
    if (backPending) {
      // 自己关弹窗触发的返回；这期间又打开了别的弹窗的话，把历史补回去
      backPending = false;
      if (DIALOGS.some((d) => d.open)) showDialog(DIALOGS.find((d) => d.open));
      return;
    }
    DIALOGS.forEach((d) => { if (d.open) d.close(); });
  });

  function dialogHead(title, sub = '') {
    return `
      <header class="dialog-head">
        <div>
          <h2>${title}</h2>
          ${sub ? `<p class="dialog-sub">${sub}</p>` : ''}
        </div>
        <button type="button" class="icon-btn" data-action="close-dialog" aria-label="关闭">${A.icon.x}</button>
      </header>`;
  }

  function openGlucoseSheet(date, slot) {
    const s = C.GLUCOSE_SLOTS.find((x) => x.id === slot);
    if (!s || !D.isISODate(date)) return;
    const entry = app.state.glucose.find((g) => g.date === date && g.slot === slot);
    const target = M.glucoseTarget(slot, app.state.prefs.glucoseAfter);
    sheetDialog.innerHTML = `
      <form class="dialog-body" data-form="glucose-cell" data-date="${date}" data-slot="${slot}" novalidate>
        ${dialogHead(`${s.name}血糖`, D.formatDate(date, { weekday: true, relativeTo: ui.today }))}
        <label class="field">
          <span>血糖 <small>mmol/L · 目标 ≤${target}</small></span>
          <input id="sheet-gl" name="value" inputmode="decimal" autocomplete="off" placeholder="5.2" value="${entry ? glText(entry.value) : ''}">
        </label>
        <p class="form-error" hidden></p>
        <div class="dialog-actions">
          ${entry ? `<button type="button" class="btn btn-quiet" data-action="delete-glucose" data-date="${date}" data-slot="${slot}">删除</button>` : ''}
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost" data-action="close-dialog">取消</button>
          <button class="btn">保存</button>
        </div>
      </form>`;
    showDialog(sheetDialog);
    if (!matchMedia('(pointer: coarse)').matches) document.getElementById('sheet-gl').focus();
  }

  function openUltrasoundSheet(id) {
    const r = id ? app.state.ultrasounds.find((u) => u.id === id) : null;
    if (id && !r) return;
    const fields = C.US_FIELDS.map((f) => {
      const v = r ? r.values[f.id] : null;
      return `
        <label class="field">
          <span>${f.name} <small>${f.abbr} · ${f.unit}</small></span>
          <input name="v-${f.id}" inputmode="${f.step >= 1 ? 'numeric' : 'decimal'}" autocomplete="off" value="${v != null ? usText(v) : ''}">
        </label>`;
    }).join('');
    sheetDialog.innerHTML = `
      <form class="dialog-body" data-form="ultrasound" data-id="${r ? esc(r.id) : ''}" novalidate>
        ${dialogHead(r ? '编辑 B 超' : '记一次 B 超', '照着 B 超单填，没有的空着就行')}
        <details class="us-paste"${r ? '' : ' open'}>
          <summary>${A.icon.scan}粘贴 B 超单上的文字，自动填好</summary>
          <ol class="us-paste-steps">
            <li>在相册里打开 B 超单照片，长按上面的字</li>
            <li>点「全选」，再点「拷贝」</li>
            <li>回到这里，粘贴到下面的框里</li>
          </ol>
          <textarea id="us-paste" rows="3" placeholder="长按这里，选「粘贴」" aria-label="B 超单上的文字"></textarea>
          <p class="us-paste-result" id="us-paste-result" aria-live="polite"></p>
        </details>
        <label class="field">
          <span>检查日期</span>
          <input type="date" name="date" max="${ui.today}" value="${r ? r.date : ui.today}">
        </label>
        <div class="us-fields">${fields}</div>
        <label class="field">
          <span>胎盘 <small>可选，例如 后壁 I 级</small></span>
          <input name="placenta" maxlength="40" autocomplete="off" value="${esc(r ? r.placenta : '')}">
        </label>
        <label class="field">
          <span>备注 <small>可选</small></span>
          <textarea name="note" rows="2" maxlength="200" placeholder="例如 头位、脐带绕颈一周">${esc(r ? r.note : '')}</textarea>
        </label>
        <p class="form-error" hidden></p>
        <div class="dialog-actions">
          ${r ? `<button type="button" class="btn btn-quiet" data-action="delete-us" data-id="${esc(r.id)}">删除这次</button>` : ''}
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost" data-action="close-dialog">取消</button>
          <button class="btn">保存</button>
        </div>
      </form>`;
    showDialog(sheetDialog);
  }

  function openJournalSheet(id) {
    const e = app.state.journal.find((x) => x.id === id);
    if (!e) return;
    sheetDialog.innerHTML = `
      <form class="dialog-body" data-form="journal-edit" data-id="${esc(e.id)}" novalidate>
        ${dialogHead('改一改这条心情', `${D.formatDate(e.date, { weekday: true, relativeTo: ui.today })}${e.time ? ` ${e.time}` : ''}`)}
        ${moodPicker(e.mood)}
        <label class="field">
          <span>想说的话 <small>可以不写</small></span>
          <textarea name="text" rows="5" maxlength="${J.TEXT_MAX}">${esc(e.text)}</textarea>
        </label>
        <label class="field">
          <span>日期</span>
          <input type="date" name="date" max="${ui.today}" value="${e.date}">
        </label>
        <p class="form-error" hidden></p>
        <div class="dialog-actions">
          <button type="button" class="btn btn-quiet" data-action="delete-journal" data-id="${esc(e.id)}">删除</button>
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost" data-action="close-dialog">取消</button>
          <button class="btn">保存</button>
        </div>
      </form>`;
    showDialog(sheetDialog);
  }

  /**
   * 把粘贴进来的 B 超单文字认一遍，认出来的填进表单并标黄，等人核对。
   * 自己改过的格子不动；粘贴的内容变了（换了张单子、删了几行），上次自动填、没人改过的格子先还原
   */
  function fillFromReport(textarea) {
    const form = textarea.form;
    const result = form.querySelector('#us-paste-result');
    if (!textarea.value.trim()) {
      result.textContent = '';
      return;
    }
    const found = M.parseUltrasoundText(textarea.value, ui.today);
    const wanted = C.US_FIELDS
      .filter((f) => found.values[f.id] != null)
      .map((f) => [form.elements[`v-${f.id}`], usText(found.values[f.id]), f.name]);
    if (found.date) wanted.push([form.elements.date, found.date, '检查日期']);
    if (found.placenta) wanted.push([form.elements.placenta, found.placenta, '胎盘']);
    // 认不出时什么都不动，免得粘错一段文字就把填好的冲掉
    if (!wanted.length) {
      result.className = 'us-paste-result is-empty';
      result.textContent = '没认出数值。可以只拷贝写着测量结果的那几行再试，或者直接在下面填。';
      return;
    }
    form.querySelectorAll('.is-filled').forEach((el) => {
      el.value = el.dataset.before;
      el.classList.remove('is-filled');
    });
    const note = form.elements.note;
    if (found.note && !note.value.trim()) wanted.push([note, found.note, '']);
    const filled = [];
    const kept = [];
    for (const [input, value, name] of wanted) {
      if (input.dataset.manual) {
        if (name) kept.push(name);
        continue;
      }
      if (!('before' in input.dataset)) input.dataset.before = input.value;
      input.value = value;
      input.classList.add('is-filled');
      if (name) filled.push(name);
    }
    result.className = 'us-paste-result is-ok';
    result.textContent = [
      filled.length ? `认出了 ${filled.join('、')}，已经填好并标黄。` : '',
      kept.length ? `${kept.join('、')}你改过，没动。` : '',
      '照片上的字偶尔会认错，对着单子核对一下再保存。',
    ].join('');
  }

  /** GitHub Pages 发布时每个文件的修改时间都是发布时间，页面的修改时间就是这一版什么时候发的 */
  function versionText() {
    const at = new Date(document.lastModified);
    if (Number.isNaN(at.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `当前版本：${at.getMonth() + 1}月${at.getDate()}日 ${pad(at.getHours())}:${pad(at.getMinutes())} 发布。`;
  }

  function viewBabySettings() {
    const b = app.state.baby;
    const B = globalThis.Baby.baby;
    return `
      <section class="settings-data">
        <h3>宝宝</h3>
        <p class="hint">${b
          ? `${esc(b.name || '宝宝')} · ${b.sex === 'boy' ? '男宝' : '女宝'} · ${D.formatDate(b.birthDate, { year: true })}出生，${B.ageText(B.ageOf(b.birthDate, ui.today))}。`
          : '宝宝出生后记下来，就能开始记喂奶、睡觉、换尿布；底部的「产检」会换成「宝宝」，产检记录收进「记录」里。'}</p>
        <div class="btn-row">
          <button type="button" class="btn ${b ? 'btn-ghost ' : ''}btn-sm" data-action="baby-birth-open">${b ? '改宝宝信息' : '宝宝出生了'}</button>
        </div>
      </section>`;
  }

  function openSettings() {
    settingsDialog.innerHTML = `
      <form class="dialog-body" data-form="settings" novalidate>
        <header class="dialog-head">
          <h2>设置</h2>
          <button type="button" class="icon-btn" data-action="close-dialog" aria-label="关闭">${A.icon.x}</button>
        </header>
        ${profileFields(app.state.profile)}
        <p class="form-error" hidden></p>
        <div class="dialog-actions">
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost" data-action="close-dialog">取消</button>
          <button class="btn">保存</button>
        </div>
        ${viewBabySettings()}
        <section class="settings-data">
          <h3>数据</h3>
          <p class="hint">记录只存在这台设备的这个浏览器里。换浏览器、清理浏览器数据之前，先导出一份备份。</p>
          <p class="hint backup-state">${app.state.prefs.lastBackup ? `上次备份：${D.formatDate(app.state.prefs.lastBackup)}。` : '还没备份过。'}</p>
          <p class="hint storage-state" hidden></p>
          <div class="btn-row">
            <button type="button" class="btn btn-ghost btn-sm" data-action="export-backup">${A.icon.download}导出备份</button>
            <button type="button" class="btn btn-ghost btn-sm" data-action="import-backup">导入备份</button>
            <button type="button" class="btn btn-ghost btn-sm" data-action="reset-checkups">恢复默认产检日程</button>
            <button type="button" class="btn btn-ghost btn-sm" data-action="reset-bag">恢复默认待产包</button>
            <button type="button" class="btn btn-quiet btn-sm" data-action="clear-all">清空全部数据</button>
          </div>
        </section>
        <section class="settings-data settings-update">
          <h3>版本</h3>
          <p class="hint">${versionText()}${ui.updateReady ? '有新版本了，刷新一下就能用上。' : '从主屏幕图标打开时没有刷新按钮，想马上用上新版本，点这里刷新。'}</p>
          <div class="btn-row">
            <button type="button" class="btn ${ui.updateReady ? '' : 'btn-ghost '}btn-sm" data-action="reload-app">刷新页面</button>
          </div>
        </section>
      </form>`;
    showDialog(settingsDialog);
    showStorageState();
  }

  /** 设置里说明浏览器会不会自动清理这里的数据；要异步问浏览器，所以打开后再填 */
  function showStorageState() {
    const el = settingsDialog.querySelector('.storage-state');
    const say = (text) => {
      el.textContent = text;
      el.hidden = false;
    };
    const risky = () => atRisk() && say('在浏览器里打开时，长时间不用记录可能被清掉，建议加到主屏幕，从图标打开。');
    if (!navigator.storage || !navigator.storage.persisted) return risky();
    navigator.storage.persisted()
      .then((kept) => (kept ? say('浏览器已经答应长期保存这里的记录，不会自动清理。') : risky()))
      .catch(risky);
  }

  function openCheckupDialog(id) {
    const ck = id ? app.state.checkups.find((c) => c.id === id) : null;
    if (id && !ck) return;
    const due = app.state.profile.dueDate;
    const templated = ck && ck.target != null;
    let hint = '';
    if (templated) {
      const suggested = D.dateAtGestation(due, ck.target);
      const range = ck.start != null && ck.end != null
        ? `建议在 ${D.formatWindow(ck.start, ck.end)}（${D.formatDate(D.dateAtGestation(due, ck.start))} – ${D.formatDate(D.dateAtGestation(due, ck.end))}）做，`
        : '';
      hint = `${range}默认按 ${D.formatDate(suggested, { weekday: true })} 提醒。约好了就填医院给的日期。`;
    }
    checkupDialog.innerHTML = `
      <form class="dialog-body" data-form="checkup" data-id="${ck ? esc(ck.id) : ''}" novalidate>
        <header class="dialog-head">
          <h2>${ck ? '编辑产检' : '添加产检'}</h2>
          <button type="button" class="icon-btn" data-action="close-dialog" aria-label="关闭">${A.icon.x}</button>
        </header>
        <label class="field">
          <span>名称</span>
          <input name="title" maxlength="30" autocomplete="off" placeholder="例如 复查血常规" value="${esc(ck ? ck.title : '')}">
        </label>
        <div class="field-row">
          <label class="field">
            <span>日期${templated ? ' <small>留空就用建议日期</small>' : ''}</span>
            <input type="date" name="date" value="${ck && ck.date ? ck.date : ''}">
          </label>
          <label class="field">
            <span>时间 <small>可选</small></span>
            <input type="time" name="time" value="${ck ? ck.time : ''}">
          </label>
        </div>
        ${hint ? `<p class="hint">${hint}</p>` : ''}
        <label class="field">
          <span>检查项目 <small>一行一项</small></span>
          <textarea name="items" rows="3" placeholder="例如 血常规">${esc(ck ? ck.items.join('\n') : '')}</textarea>
        </label>
        <label class="field">
          <span>提前准备 <small>会出现在提醒里</small></span>
          <textarea name="prep" rows="2" placeholder="例如 空腹、带上次的报告">${esc(ck ? ck.prep : '')}</textarea>
        </label>
        <p class="form-error" hidden></p>
        <div class="dialog-actions">
          ${ck ? `<button type="button" class="btn btn-quiet" data-action="delete-checkup" data-id="${esc(ck.id)}">删除这项</button>` : ''}
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost" data-action="close-dialog">取消</button>
          <button class="btn">保存</button>
        </div>
      </form>`;
    showDialog(checkupDialog);
  }

  function openMedDialog(id) {
    const med = id ? app.state.meds.find((m) => m.id === id) : null;
    if (id && !med) return;
    const kind = med ? med.kind : 'supplement';
    const suggest = C.MED_SUGGESTIONS.map((n) => `<button type="button" class="chip" data-action="med-suggest" data-name="${esc(n)}">${esc(n)}</button>`).join('');
    medDialog.innerHTML = `
      <form class="dialog-body" data-form="med" data-id="${med ? esc(med.id) : ''}" novalidate>
        <header class="dialog-head">
          <h2>${med ? '编辑记录' : '记一样药或补剂'}</h2>
          <button type="button" class="icon-btn" data-action="close-dialog" aria-label="关闭">${A.icon.x}</button>
        </header>
        <label class="field">
          <span>名称</span>
          <input name="name" maxlength="${M.MED_NAME_MAX}" autocomplete="off" placeholder="例如 叶酸" value="${esc(med ? med.name : '')}"${med ? '' : ' autofocus'}>
        </label>
        ${med ? '' : `<div class="suggest"><span>常用</span>${suggest}</div>`}
        <div class="field">
          <span>类型</span>
          <div class="seg">
            <label><input type="radio" name="kind" value="supplement"${kind === 'supplement' ? ' checked' : ''}><span>补剂</span></label>
            <label><input type="radio" name="kind" value="medicine"${kind === 'medicine' ? ' checked' : ''}><span>药物</span></label>
          </div>
        </div>
        <label class="field">
          <span>用量 <small>可选</small></span>
          <input name="dose" maxlength="40" autocomplete="off" placeholder="例如 每天 1 片" value="${esc(med ? med.dose : '')}">
        </label>
        <div class="field-row">
          <label class="field">
            <span>开始日期</span>
            <input type="date" name="start" max="${ui.today}" value="${med ? med.start : ui.today}">
          </label>
          <label class="field">
            <span>结束日期 <small>还在吃就留空</small></span>
            <input type="date" name="end" value="${med && med.end ? med.end : ''}">
          </label>
        </div>
        <label class="field">
          <span>备注 <small>可选</small></span>
          <textarea name="note" rows="2" maxlength="120" placeholder="例如 医生开的；感冒吃了 3 天">${esc(med ? med.note : '')}</textarea>
        </label>
        <p class="form-error" hidden></p>
        <div class="dialog-actions">
          ${med ? `<button type="button" class="btn btn-quiet" data-action="delete-med" data-id="${esc(med.id)}">删除这条</button>` : ''}
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost" data-action="close-dialog">取消</button>
          <button class="btn">保存</button>
        </div>
      </form>`;
    showDialog(medDialog);
  }

  function formError(form, message) {
    const el = form.querySelector('.form-error');
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
  }

  Object.assign(app, {
    showDialog, dialogHead, onDialogClose, closeDialog, openGlucoseSheet, openUltrasoundSheet, openJournalSheet, fillFromReport, openSettings,
    openCheckupDialog, openMedDialog, formError
  });
})();
