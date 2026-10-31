(function () {
  'use strict';
  // 「宝宝」页按分页分发，以及成长（曲线、牙齿、里程碑、其它的第一次）、疫苗、儿保体检、体温和用药、辅食这几页；
  // 日常那页、记一笔和首页在 baby.js
  const { dates: D, baby: Bb, babyBook: BOOK, babyFood: FOOD, growthStandard: STD, chart: Chart, art: A, app } = globalThis.Baby;
  const {
    esc, ui, babyAgeNow: ageNow, babyWho: who, babySexName: sexName, babyWhenText: whenText, babyLevelNames: LEVEL_NAMES,
    babySiteName: siteName, babyFoodDot: foodDot, babyExamWhen: examWhen, viewBabyLogRow: viewLogRow, viewBabyDaily: viewDaily,
  } = app;

  const VIEWS = [['', '日常'], ['growth', '成长'], ['vaccines', '疫苗'], ['exams', '体检'], ['health', '健康'], ['food', '辅食']];
  const tagName = Object.fromEntries(FOOD.tags);
  const allergenName = Object.fromEntries(FOOD.allergens);
  const kid = () => app.state.baby;

  // ---------- 宝宝页 ----------

  function viewBabyPage(route, { now }) {
    if (!kid()) {
      return `
        <article class="card">
          <div class="empty">
            <span class="empty-art empty-bee">${A.bee}</span>
            <p>宝宝出生后，在这里记喂奶、睡觉、换尿布，看生长曲线和疫苗。</p>
            <button type="button" class="btn btn-sm" data-action="baby-birth-open">宝宝出生了</button>
          </div>
        </article>`;
    }
    const views = { '': viewDaily, growth: viewGrowth, vaccines: viewVaccines, exams: viewExams, health: viewHealth, food: viewFood };
    return `
      <nav class="seg-tabs" aria-label="宝宝">
        ${VIEWS.map(([id, name]) => `<a href="#/baby${id ? `/${id}` : ''}" class="seg-tab"${route.sub === id ? ' aria-current="page"' : ''}>${name}</a>`).join('')}
      </nav>
      ${views[route.sub](now)}`;
  }

  function viewGrowth() {
    const b = kid();
    const age = ageNow();
    const rows = Bb.growthRows(b, STD);
    const metric = Bb.METRICS.find((m) => m.id === ui.growthMetric) || Bb.METRICS[0];
    const latest = [...rows].reverse().find((r) => r[metric.id] != null);
    const birth = b.growth.find((g) => g.date === b.birthDate);
    const birthText = birth ? Bb.METRICS.filter((m) => birth[m.id] != null).map((m) => `${birth[m.id]} ${m.unit}`).join(' · ') : '';
    let now = '<p class="growth-now">还没量过。量了记下来，看看长在哪条线附近。</p>';
    if (latest) {
      const z = latest.z[metric.id];
      const where = z == null ? '' : `，大约第 <b>${Bb.percentile(z)}</b> 百分位${{ low: '，比大多数同龄宝宝小，体检时问问医生', high: '，比大多数同龄宝宝大', ok: '' }[Bb.growthLevel(z)]}`;
      now = `<p class="growth-now">${D.formatDate(latest.date)} 量的${metric.name}：<b>${latest[metric.id]}</b> ${metric.unit}${where}</p>`;
    }
    const list = rows.slice().reverse().map((r) => `
      <li class="gr-item">
        <span class="gr-when">${D.formatDate(r.date)}<small>${Bb.ageText(Bb.ageOf(b.birthDate, r.date))}</small></span>
        <span class="gr-vals">${Bb.METRICS.filter((m) => r[m.id] != null).map((m) => `<span>${m.name} <b>${r[m.id]}</b> ${m.unit}${r.z[m.id] == null ? '' : `<small>P${Bb.percentile(r.z[m.id])}</small>`}</span>`).join('')}</span>
        <button type="button" class="icon-btn icon-btn-sm" data-action="growth-delete" data-date="${r.date}" aria-label="删掉 ${D.formatDate(r.date)} 的这次" title="删掉">${A.icon.x}</button>
      </li>`).join('');
    return `
      <article class="card baby-profile">
        <div class="profile-row">
          <span class="profile-art">${A.honeyPot}</span>
          <div class="profile-text">
            <h2 class="profile-name">${who()}<small>${sexName(b)}</small></h2>
            <p class="profile-age">出生第 ${age.days + 1} 天 · ${Bb.ageText(age)}</p>
            <p class="profile-birth">${D.formatDate(b.birthDate, { year: true })}${b.birthTime ? ` ${b.birthTime}` : ''} 出生${birthText ? ` · ${birthText}` : ''}</p>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" data-action="baby-birth-open">改信息</button>
        </div>
      </article>
      <article class="card baby-growth">
        <header class="card-head">
          <div>
            <h2 class="card-title">${A.icon.scale}生长曲线</h2>
            <p class="card-meta">和 WHO 儿童生长标准比，阴影是大多数宝宝（P3–P97）的范围</p>
          </div>
        </header>
        <div class="recipe-chips" role="group" aria-label="看哪一项">
          ${Bb.METRICS.map((m) => `<button type="button" class="chip" id="metric-${m.id}" data-action="growth-metric" data-metric="${m.id}" aria-pressed="${m.id === metric.id}">${m.name}</button>`).join('')}
        </div>
        ${age.days > 730 ? '<p class="hint">曲线画到 2 岁；2 岁以后的数照样记着。</p>' : ''}
        <div id="growth-chart" class="chart growth-chart"></div>
        ${now}
        <form class="growth-form" data-form="baby-growth" novalidate>
          <label class="field"><span>哪天量的</span><input type="date" id="g-date" name="date" value="${ui.today}" min="${b.birthDate}" max="${ui.today}" data-keep></label>
          ${Bb.METRICS.map((m) => `<label class="field"><span>${m.name} <small>${m.unit}</small></span><input id="g-${m.id}" name="${m.id}" inputmode="decimal" autocomplete="off" placeholder="${{ weight: '6.2', length: '62.5', head: '40.5' }[m.id]}" data-keep></label>`).join('')}
          <button class="btn">记一次</button>
          <p class="form-error" hidden></p>
        </form>
        ${list ? `<ul class="gr-list">${list}</ul>` : ''}
        <p class="fineprint">一次的数说明不了太多，沿着自己的线平稳地长最重要。6 个月内每个月量一次，之后 1～3 个月量一次；体检时医生量的也可以记在这里。</p>
      </article>
      ${viewTeeth()}
      ${viewMilestones()}`;
  }

  // 牙在图上的位置（占图宽、图高的百分比）：上下两排各 10 颗，从左到右是宝宝的右边到左边，门牙在中间
  const TOOTH_SIZE = [0, 9, 8.5, 9.5, 11, 12];
  function toothSpot(r) {
    const i = r.side === 'r' ? 5 - r.pos : 4 + r.pos;
    const deg = r.jaw === 'upper' ? 160 - (i * 140) / 9 : 200 + (i * 140) / 9;
    const rad = (deg * Math.PI) / 180;
    return { x: 50 + 41 * Math.cos(rad), y: 50 - 43 * Math.sin(rad), size: TOOTH_SIZE[r.pos] };
  }

  const TOOTH_STATE = { done: '长了', now: '这阵子一般会长', past: '一般已经长了，还没记', later: '还早' };

  /** 「长牙」：一张上下两排的小图，点哪颗记哪天长出来 */
  function viewTeeth() {
    const b = kid();
    const rows = Bb.teethRows(b, BOOK, ui.today);
    const sum = Bb.teethSummary(rows, b, BOOK, ui.today);
    const lines = [
      sum.count ? `长了 <b>${sum.count}</b> 颗，第一颗是 ${D.formatDate(sum.first.date)}（${Bb.ageText(Bb.ageOf(b.birthDate, sum.first.date))}）` : '还没长牙',
      sum.next ? `接下来一般是${sum.next.kind}（${sum.next.from}～${sum.next.to} 个月）${rows.some((r) => r.status === 'now') ? '，图上虚线圈出来的是这阵子一般会长的' : ''}` : '20 颗乳牙都长齐啦',
    ];
    return `
      <article class="card baby-teeth">
        <header class="card-head"><div><h2 class="card-title">${A.icon.smile}长牙</h2><p class="card-meta">点一颗，记下哪天看到长出来</p></div></header>
        <div class="teeth-map">
          <svg viewBox="0 0 100 80" preserveAspectRatio="none" aria-hidden="true">
            <path d="M 11.5 28.2 A 41 34.4 0 0 1 88.5 28.2" class="gum"/>
            <path d="M 11.5 51.8 A 41 34.4 0 0 0 88.5 51.8" class="gum"/>
          </svg>
          <span class="jaw-label jaw-upper">上</span><span class="jaw-label jaw-lower">下</span>
          ${rows.map((r) => {
            const s = toothSpot(r);
            return `<button type="button" class="tooth tooth-${r.status}" id="tooth-${r.id}" data-action="tooth-open" data-id="${r.id}" style="left:${s.x.toFixed(1)}%;top:${s.y.toFixed(1)}%;width:${s.size}%" aria-label="${r.name}：${r.date ? `${D.formatDate(r.date)}长的` : TOOTH_STATE[r.status]}" title="${r.name}"></button>`;
          }).join('')}
        </div>
        <p class="teeth-note">${lines.join('；')}。</p>
        ${sum.late ? '<p class="rec-alert rec-alert-low">满 13 个月还一颗没长，体检时问问医生；有的宝宝 1 岁多才长，多半没事。</p>' : ''}
        <p class="fineprint">${BOOK.teethTips}萌出时间参考 MSD 诊疗手册，刷牙和看牙按国家卫健委的口腔保健建议。</p>
      </article>`;
  }

  function viewMilestones() {
    const b = kid();
    const rows = Bb.milestoneRows(b, BOOK, ui.today);
    const state = { done: '', now: '这阵子', soon: '', past: '还没记' };
    return `
      <article class="card baby-milestones">
        <header class="card-head"><h2 class="card-title">${A.icon.flag}成长里程碑</h2></header>
        <ul class="ms-list">${rows.map((r) => `
          <li class="ms ms-${r.status}">
            <button type="button" class="ms-open" id="ms-${r.id}" data-action="milestone-open" data-id="${r.id}">
              <span class="ms-dot">${r.status === 'done' ? A.icon.check : ''}</span>
              <span class="ms-name">${r.name}</span>
              <span class="ms-when">${r.date ? `${D.formatDate(r.date)} · ${Bb.ageText(r.at)}` : `多数宝宝 ${r.from}–${r.to} 个月`}</span>
              ${state[r.status] ? `<span class="tag${r.status === 'now' ? ' tag-next' : ''}">${state[r.status]}</span>` : ''}
            </button>
          </li>`).join('')}
        </ul>
        <section class="ms-moments">
          <h3>其它的第一次</h3>
          ${b.moments.length ? `<ul class="ms-list">${b.moments.slice().reverse().map((m) => `
            <li class="ms ms-done">
              <span class="ms-open"><span class="ms-dot">${A.icon.check}</span><span class="ms-name">${esc(m.name)}</span><span class="ms-when">${D.formatDate(m.date)} · ${Bb.ageText(Bb.ageOf(b.birthDate, m.date))}</span></span>
              <button type="button" class="icon-btn icon-btn-sm" data-action="moment-delete" data-id="${m.id}" aria-label="删掉「${esc(m.name)}」" title="删掉">${A.icon.x}</button>
            </li>`).join('')}</ul>` : ''}
          <form class="moment-form" data-form="baby-moment" novalidate>
            <input id="mo-name" name="name" maxlength="20" autocomplete="off" placeholder="比如 第一次去公园、第一次叫妈妈" aria-label="第一次做的事" data-keep>
            <input type="date" id="mo-date" name="date" value="${ui.today}" min="${b.birthDate}" max="${ui.today}" aria-label="哪天" data-keep>
            <button class="btn btn-sm">记下</button>
            <p class="form-error" hidden></p>
          </form>
        </section>
        <p class="fineprint">坐、爬、站、走参考 WHO 运动发育研究，其它是大致的时间。每个宝宝节奏不一样，早一点、晚一点都常见；一直没出现，或者会了又不会了，体检时问问医生。</p>
      </article>`;
  }

  function viewVaccines() {
    const b = kid();
    const rows = Bb.vaccineRows(b, BOOK, ui.today);
    const next = Bb.nextVaccine(rows);
    const groups = [];
    for (const r of rows.filter((x) => x.status !== 'done')) {
      if (!groups.length || groups[groups.length - 1].from !== r.from) groups.push({ from: r.from, when: r.when, due: r.due, rows: [] });
      groups[groups.length - 1].rows.push(r);
    }
    const done = rows.filter((r) => r.status === 'done');
    const nextText = next
      ? `下一针：<b>${next.name}第 ${next.dose} 剂</b> · ${next.booked ? `约在 ${D.formatDate(next.booked, { weekday: true })}` : `${D.formatDate(next.due)}起可以打`}`
      : '国家免疫规划的疫苗都打完啦';
    return `
      <div class="remind-strip">
        <p>${A.icon.syringe}<span>${nextText}</span></p>
        ${next ? `<button type="button" class="pill pill-btn" data-action="vaccine-ics">${A.icon.calendarPlus}导入手机日历</button>` : ''}
      </div>
      <article class="card baby-vaccines" aria-label="国家免疫规划疫苗">
        ${done.length ? `
          <details class="vx-done-list" id="vx-done"${ui.vaccinesDoneOpen ? ' open' : ''}>
            <summary>已经打完 ${done.length} 针</summary>
            <ul class="vx-list">${done.map((r) => `
              <li class="vx vx-done vx-compact">
                <span class="vx-dot">${A.icon.check}</span>
                <p class="vx-name">${r.name}<span class="tag">第 ${r.dose} 剂</span></p>
                <button type="button" class="link" id="vx-open-${r.id}" data-action="vaccine-open" data-id="${r.id}">${D.formatDate(r.done, { relativeTo: ui.today })}</button>
              </li>`).join('')}
            </ul>
          </details>` : ''}
        ${groups.map((g) => `
          <section class="vx-group">
            <h3 class="tl-title">${g.when}<small>${D.formatDate(g.due, { relativeTo: ui.today })}</small></h3>
            <ul class="vx-list">${g.rows.map(viewVaccineRow).join('')}</ul>
          </section>`).join('')}
      </article>
      <article class="card baby-extra">
        <header class="card-head"><h2 class="card-title">${A.icon.syringe}自费疫苗和其它</h2></header>
        ${b.extraVaccines.length ? `<ul class="vx-list">${b.extraVaccines.map((v) => `
          <li class="vx vx-${v.done ? 'done' : 'later'}">
            <span class="vx-dot">${v.done ? A.icon.check : ''}</span>
            <div class="vx-main"><p class="vx-name">${esc(v.name)}</p><p class="vx-when">${D.formatDate(v.date, { weekday: true, relativeTo: ui.today })}${v.done ? ' 打完了' : ' 约好了'}</p></div>
            <div class="vx-actions">
              ${v.done ? '' : `<button type="button" class="chip" data-action="extra-vaccine-done" data-id="${v.id}">${A.icon.check}打完了</button>`}
              <button type="button" class="icon-btn icon-btn-sm" data-action="extra-vaccine-delete" data-id="${v.id}" aria-label="删掉「${esc(v.name)}」" title="删掉">${A.icon.x}</button>
            </div>
          </li>`).join('')}</ul>` : ''}
        <form class="extra-form" data-form="extra-vaccine" novalidate>
          <input id="xv-name" name="name" maxlength="20" autocomplete="off" placeholder="比如 13 价肺炎第 1 剂" aria-label="疫苗名字" data-keep>
          <input type="date" id="xv-date" name="date" value="${ui.today}" aria-label="哪天" data-keep>
          <label class="extra-done"><input type="checkbox" name="done" checked>已经打了</label>
          <button class="btn btn-sm">加上</button>
          <p class="form-error" hidden></p>
        </form>
      </article>
      <p class="fineprint">${BOOK.vaccineNotes.join('')}参考《国家免疫规划疫苗儿童免疫程序及说明（2021 年版）》，百白破按 2025 年起的新程序。</p>`;
  }

  /** 体检什么时候去：约好的日子 / 现在可以去了 / 几号起 */
  function viewExams() {
    const rows = Bb.examRows(kid(), BOOK, ui.today);
    const next = Bb.nextExam(rows);
    const done = rows.filter((r) => r.status === 'done');
    const late = rows.filter((r) => r.status === 'late');
    const open = rows.filter((r) => r.status !== 'done' && r.status !== 'late');
    return `
      <div class="remind-strip">
        <p>${A.icon.calendarHeart}<span>${next ? `下一次：<b>${next.name}</b> · ${examWhen(next)}` : '3 岁前的体检都做完啦'}</span></p>
        ${open.length ? `<button type="button" class="pill pill-btn" data-action="exam-ics">${A.icon.calendarPlus}导入手机日历</button>` : ''}
      </div>
      <article class="card baby-exams" aria-label="儿保体检">
        ${late.length ? `
          <div class="past-strip">
            <span>有 ${late.length} 次体检过了时间、没记做过。</span>
            <button type="button" class="btn btn-ghost btn-sm" data-action="exam-past-done">都做过了</button>
          </div>` : ''}
        ${done.length ? `
          <details class="vx-done-list" id="ex-done"${ui.examsDoneOpen ? ' open' : ''}>
            <summary>已经做过 ${done.length} 次</summary>
            <ul class="vx-list">${done.map((r) => `
              <li class="vx vx-done vx-compact">
                <span class="vx-dot">${A.icon.check}</span>
                <p class="vx-name">${r.name}</p>
                <button type="button" class="link" id="ex-open-${r.id}" data-action="exam-open" data-id="${r.id}">${D.formatDate(r.done, { relativeTo: ui.today })}</button>
              </li>`).join('')}
            </ul>
          </details>` : ''}
        <ul class="vx-list">${[...late, ...open].map(viewExamRow).join('')}</ul>
      </article>
      <p class="fineprint">${BOOK.examNotes.join('')}项目参考《0～6 岁儿童健康管理服务规范》，「要留意」来自《0～6 岁儿童孤独症筛查干预服务规范（试行）》；产后访视和 42 天检查按上海的做法。</p>`;
  }

  function viewExamRow(r) {
    let status = r.booked ? examWhen(r) : '';
    if (r.status === 'late') status = '过了时间，还没去的话打电话问问社区';
    else if (!r.booked && r.status === 'due') status = examWhen(r);
    else if (!r.booked && r.status === 'soon') status = `${D.diffDays(ui.today, r.from)} 天后可以去`;
    return `
      <li class="vx vx-${r.status}">
        <span class="vx-dot"></span>
        <div class="vx-main">
          <p class="vx-name"><button type="button" class="ex-name" data-action="exam-open" data-id="${r.id}">${r.name}</button>${r.who === 'both' ? '<span class="tag">妈妈和宝宝</span>' : ''}</p>
          <p class="vx-when">${D.formatDate(r.from, { relativeTo: ui.today })}～${D.formatDate(r.to, { relativeTo: r.from })}${r.where === BOOK.examWhere ? '' : ` · ${r.where}`}</p>
          ${r.who === 'both' ? '' : `<p class="vx-when">${r.items.join(' · ')}</p>`}
          ${status ? `<p class="vx-status">${status}</p>` : ''}
        </div>
        <div class="vx-actions">
          ${r.status === 'later' && !r.booked ? '' : `<button type="button" class="chip" id="ex-done-${r.id}" data-action="exam-done" data-id="${r.id}">${A.icon.check}做完了</button>`}
          <button type="button" class="chip" id="ex-book-${r.id}" data-action="exam-open" data-id="${r.id}">${r.booked ? '改约' : '约日期'}</button>
        </div>
      </li>`;
  }

  function viewVaccineRow(r) {
    const booked = r.booked ? `约在 ${D.formatDate(r.booked, { weekday: true, relativeTo: ui.today })}` : '';
    let status = booked;
    if (r.status === 'late') status = '过了建议的时间，尽快去补';
    else if (!booked && r.status === 'due') status = '到时间了，可以打了';
    else if (!booked && r.status === 'soon') status = `${D.diffDays(ui.today, r.due)} 天后可以打`;
    return `
      <li class="vx vx-${r.status}">
        <span class="vx-dot">${r.status === 'done' ? A.icon.check : ''}</span>
        <div class="vx-main">
          <p class="vx-name">${r.name}<span class="tag">第 ${r.dose} 剂</span></p>
          <p class="vx-when">${D.formatDate(r.due, { relativeTo: ui.today })}起${r.deadline ? `，${D.formatDate(r.deadline, { relativeTo: ui.today })}前打完` : ''}${r.note ? ` · ${r.note}` : ''}</p>
          ${status ? `<p class="vx-status">${status}</p>` : ''}
        </div>
        <div class="vx-actions">
          <button type="button" class="chip" id="vx-done-${r.id}" data-action="vaccine-done" data-id="${r.id}">${A.icon.check}打完了</button>
          <button type="button" class="chip" id="vx-open-${r.id}" data-action="vaccine-open" data-id="${r.id}">${r.booked ? '改约' : '约日期'}</button>
        </div>
      </li>`;
  }

  function viewHealth(now) {
    const b = kid();
    const temps = b.logs.filter((l) => l.type === 'temp').slice(-30).reverse();
    const meds = b.logs.filter((l) => l.type === 'med').slice(-30).reverse();
    const last = temps[0];
    const level = last ? Bb.tempOf(BOOK, b, last) : null;
    const lately = last && now - last.start < 24 * 3600000;
    const advice = lately && Bb.isFever(level)
      ? `<p class="rec-alert rec-alert-${level === 'high' || ageNow().days < 90 ? 'severe' : 'high'}">${A.icon.alert}<span>${ageNow().days < 90 ? '3 个月以下的宝宝发热，尽快去医院。' : BOOK.feverAdvice}</span></p>`
      : lately && level === 'cool' ? `<p class="rec-alert rec-alert-high">${A.icon.alert}<span>${BOOK.coolAdvice}</span></p>` : '';
    const row = (l) => viewLogRow(l, now).replace('class="blog-time">', `class="blog-time">${Bb.dayOf(l.start) === Bb.dayOf(now) ? '' : `${D.formatDate(Bb.dayOf(l.start))} `}`);
    const recentMeds = [...new Set(meds.map((m) => m.name))].slice(0, 4);
    const fills = [...new Set(['维生素 D', ...recentMeds])].slice(0, 5);
    return `
      <article class="card baby-temp">
        <header class="card-head"><h2 class="card-title">${A.icon.thermo}体温</h2></header>
        ${last ? `<p class="temp-now temp-${level}"><b>${last.value}℃</b><span>${siteName[last.site]} · ${LEVEL_NAMES[level]} · ${whenText(last.start, now)}</span></p>` : ''}
        ${advice}
        <form class="rec-form" data-form="baby-temp" novalidate>
          <div class="temp-row">
            <label class="field"><span>体温 <small>℃</small></span><input id="bt-value" name="value" inputmode="decimal" autocomplete="off" placeholder="36.8" data-keep></label>
            <div class="seg" role="radiogroup" aria-label="量的哪里">${BOOK.feverSites.map(([id, name]) => `<label><input type="radio" name="site" value="${id}"${id === 'armpit' ? ' checked' : ''}><span>${name}</span></label>`).join('')}</div>
          </div>
          <p class="form-error" hidden></p>
          <button class="btn btn-block">记下</button>
        </form>
        ${temps.length ? `<ul class="blog-list">${temps.map(row).join('')}</ul>` : ''}
        <p class="fineprint">腋下 37.5℃、耳温 38℃ 起算发热。${BOOK.feverAdvice}</p>
      </article>
      <article class="card baby-meds">
        <header class="card-head"><h2 class="card-title">${A.icon.pill}用药</h2></header>
        <form class="rec-form" data-form="baby-med" novalidate>
          <div class="field-row">
            <label class="field"><span>药名</span><input id="bm-name" name="name" maxlength="20" autocomplete="off" placeholder="例如 维生素 D" data-keep></label>
            <label class="field"><span>剂量 <small>可选</small></span><input id="bm-dose" name="dose" maxlength="20" autocomplete="off" placeholder="例如 1 粒" data-keep></label>
          </div>
          <div class="suggest"><span>常用：</span>${fills.map((n) => `<button type="button" class="chip" data-action="baby-med-fill" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div>
          <p class="form-error" hidden></p>
          <button class="btn btn-block">记下</button>
        </form>
        ${meds.length ? `<ul class="blog-list">${meds.map(row).join('')}</ul>` : ''}
        <p class="fineprint">给宝宝用药按医生的交代或说明书来，这里帮你记着什么时候吃过、吃了多少。</p>
      </article>`;
  }

  /** 宝宝还没出生：按月龄分好的辅食先看看 */
  function viewFoodPreview() {
    return `
      <article class="card baby-food-stage">
        <p class="eyebrow">宝宝满 6 个月开始加辅食</p>
        <p class="recipe-tip">第一口从富含铁的泥糊开始，一样一样地加，慢慢从泥变成碎末、软块；1 岁以后吃软一点、淡一点的家常饭。下面按月龄分好了，先看看。宝宝出生后，这里会按月龄推荐今天做什么。</p>
        <table class="food-amounts">
          <caption>每天大概吃多少</caption>
          <thead><tr><th></th><th>7～12 个月</th><th>1～2 岁</th></tr></thead>
          <tbody>${BOOK.foodAmounts.map((a) => `<tr><th>${a[0]}</th><td>${a[1]}</td><td>${a[2]}</td></tr>`).join('')}</tbody>
        </table>
        <details class="food-rules">
          <summary>加辅食的几条规矩</summary>
          <ul>${BOOK.foodRules.map((t) => `<li>${t}</li>`).join('')}</ul>
        </details>
      </article>
      <article class="card baby-food-all">
        <header class="card-head"><h2 class="card-title">${A.icon.pot}全部辅食</h2></header>
        ${BOOK.foodStages.map((s) => `
          <section class="recipe-group">
            <h3>${s.name}<small>${s.texture}</small></h3>
            <ul class="dish-list">${FOOD.recipes.filter((r) => r.stage === s.from).map((r) => viewFoodRow(r)).join('')}</ul>
          </section>`).join('')}
      </article>
      <p class="fineprint">参考《中国 7～24 月龄婴幼儿喂养指南（2022）》。早产、过敏体质、长得慢的宝宝，什么时候加、加什么听医生的。</p>`;
  }

  function viewFood() {
    const b = kid();
    if (!b) return viewFoodPreview();
    const age = ageNow();
    const stage = Bb.foodStage(BOOK, age.months);
    const picks = age.months >= 6 ? Bb.foodToday(FOOD, BOOK, b, ui.today) : [];
    const start = Bb.addMonths(b.birthDate, 6);
    const col = age.months >= 13 ? 2 : 1;
    const intro = stage ? `
      <p class="eyebrow">${stage.name} · ${stage.texture}</p>
      <p class="recipe-tip">${stage.tip}${stage.meals}。</p>
      ${age.months >= 7 ? `
        <table class="food-amounts">
          <caption>每天大概吃多少（${col === 1 ? '7～12 个月' : '1～2 岁'}）</caption>
          <tbody>${BOOK.foodAmounts.map((a) => `<tr><th>${a[0]}</th><td>${a[col]}</td></tr>`).join('')}</tbody>
        </table>` : ''}` : `
      <p class="eyebrow">还不到 6 个月</p>
      <p class="recipe-tip">满 6 个月（${D.formatDate(start, { year: true })}）再开始加辅食，现在母乳或配方奶就够了。下面先看看第一口可以吃什么。</p>`;
    const today = picks.length ? `
      <article class="card baby-food-today">
        <header class="card-head"><h2 class="card-title">${A.icon.bowl}今天可以做</h2></header>
        <ul class="dish-list">${picks.map((r) => viewFoodRow(r, 'food-today')).join('')}</ul>
        ${picks.some((r) => Bb.newFoods(FOOD, b, r).length) ? '<p class="hint">带「新」的是第一次吃的食材，这几天先别再加别的新食材。</p>' : '<p class="hint">这几天先吃熟悉的，过两三天再加新食材。</p>'}
      </article>` : '';
    const stages = BOOK.foodStages.map((s) => {
      const items = FOOD.recipes.filter((r) => r.stage === s.from);
      const later = s.from > Math.max(age.months, 6);
      return `
        <section class="recipe-group${later ? ' is-later' : ''}">
          <h3>${s.name}<small>${later ? `满 ${s.from} 个月以后` : s.texture}</small></h3>
          <ul class="dish-list">${items.map((r) => viewFoodRow(r)).join('')}</ul>
        </section>`;
    }).join('');
    const foods = Bb.foodList(FOOD);
    const feelName = Object.fromEntries(Bb.FEELS.map((f) => [f.id, f.name]));
    const reacted = foods.filter((n) => b.foodNotes[n] && b.foodNotes[n].feel === 'reaction');
    return `
      <article class="card baby-food-stage">
        ${intro}
        <details class="food-rules">
          <summary>加辅食的几条规矩</summary>
          <ul>${BOOK.foodRules.map((t) => `<li>${t}</li>`).join('')}</ul>
        </details>
      </article>
      ${today}
      <article class="card baby-food-all">
        <header class="card-head"><h2 class="card-title">${A.icon.pot}全部辅食</h2></header>
        ${stages}
      </article>
      <article class="card baby-tried">
        ${reacted.length ? `<p class="food-reacted">${A.icon.alert}<span>有过反应：${reacted.map((n) => `${esc(n)}${b.foodNotes[n].note ? `（${esc(b.foodNotes[n].note)}）` : ''}`).join('、')}。含这些的辅食先不推荐了，问问医生什么时候能再试。</span></p>` : ''}
        <details class="food-tried" id="food-tried"${ui.triedOpen ? ' open' : ''}>
          <summary>吃过的食材<small>${Object.keys(b.tried).length}/${foods.length}</small></summary>
          <p class="hint">记辅食时会自动勾上，没记的点一下也能勾；吃过的再点一下，标一标爱不爱吃、有没有反应。</p>
          <div class="recipe-chips">${foods.map((n) => {
            const fn = b.foodNotes[n];
            return `<button type="button" class="chip${fn ? ` chip-feel-${fn.feel}` : ''}" id="tried-${esc(n)}" data-action="${b.tried[n] ? 'tried-open' : 'tried-toggle'}" data-food="${esc(n)}" aria-pressed="${Boolean(b.tried[n])}">${esc(n)}${fn ? `<small>${feelName[fn.feel]}</small>` : ''}</button>`;
          }).join('')}</div>
        </details>
      </article>
      <p class="fineprint">参考《中国 7～24 月龄婴幼儿喂养指南（2022）》。早产、过敏体质、长得慢的宝宝，什么时候加、加什么听医生的。</p>`;
  }

  /** 今天推荐的和全部辅食里会有同一道，id 前缀分开 */
  function viewFoodRow(r, prefix = 'food') {
    const fresh = kid() ? Bb.newFoods(FOOD, kid(), r) : [];
    const bad = kid() ? Bb.reactionsIn(kid(), r) : [];
    const tags = [...r.good.map((g) => tagName[g]), ...r.allergens.map((a) => `含${allergenName[a]}`)];
    return `
      <li class="dish">
        <button type="button" class="dish-open" id="${prefix}-${r.id}" data-action="baby-food-open" data-id="${r.id}">
          ${foodDot(r)}
          <span class="dish-name">${esc(r.name)}${bad.length ? `<span class="tag tag-lv-high">有过反应：${bad.map(esc).join('、')}</span>` : fresh.length ? `<span class="tag tag-next">新：${fresh.map(esc).join('、')}</span>` : ''}</span>
          <span class="dish-meta">${r.minutes} 分钟 · ${tags.join(' · ')}</span>
        </button>
      </li>`;
  }

  function drawGrowth() {
    const box = document.getElementById('growth-chart');
    if (!box || !app.state || !kid()) return;
    const b = kid();
    const metric = Bb.METRICS.find((m) => m.id === ui.growthMetric) || Bb.METRICS[0];
    const maxDay = Math.min(730, Math.max(183, ageNow().days + 61));
    const points = Bb.growthRows(b, STD).filter((r) => r[metric.id] != null && r.day <= maxDay).map((r) => ({ day: r.day, value: r[metric.id], date: r.date }));
    const width = Math.max(260, Math.round(box.clientWidth));
    box.innerHTML = Chart.growth({
      curves: Bb.curves(STD, metric.id, b.sex, maxDay),
      points,
      unit: metric.unit,
      label: `${metric.name}生长曲线`,
      width,
      height: width < 420 ? 240 : 300,
    });
  }

  Object.assign(app, { viewBabyPage, drawGrowth, viewWeaningTool: viewFood });
})();
