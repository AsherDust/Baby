(function () {
  'use strict';
  // 「记录」页：体重、用药、血压、血糖，以及妈妈的变化和每周变化
  const { dates: D, content: C, model: M, art: A, app } = globalThis.Baby;
  const { WEIGHTS_SHOWN, esc, kg, kgDiff, clamp01, hhmm, ui } = app;

  const GAIN_HEAD = { ok: '在推荐范围内', high: '比推荐长得快', low: '比推荐长得慢' };
  const num1 = (n) => String(Math.round(n * 10) / 10);

  /** 体重卡片上的推荐范围：现在长得怎么样，按孕前 BMI 整个孕期该长多少；宝宝出生后不显示 */
  function viewGainPlan(today) {
    if (app.state.baby) return '';
    const plan = M.gainPlan(app.state.profile);
    if (!plan) {
      return `<p class="gain-missing">在设置里填上孕前体重和身高，就能看到孕期该长多少、现在长得怎么样。<button type="button" class="link" data-action="open-settings">去填</button></p>`;
    }
    if (!plan.applies) return '<p class="gain-missing">身高不到 140 厘米或孕前体重超过 125 千克时，国家的推荐值不适用，孕期长多少听医生的。</p>';
    const st = M.gainStatus(app.state, today);
    const advice = st && {
      ok: '',
      high: '少喝甜饮料，少吃油炸和甜点，主食换一部分粗粮，每天走一走；下次产检问问医生。',
      low: st.weeks < 14 ? '孕早期吐得厉害时，体重掉一点很常见；一直吃不下东西，要告诉医生。' : '三餐吃够主食和鱼禽蛋肉，再加一两顿加餐；下次产检问问医生。',
    }[st.level];
    return `
      <div class="gain-plan${st ? ` gain-${st.level}` : ''}">
        ${st ? `<p><b>${GAIN_HEAD[st.level]}</b>：孕 ${st.weeks} 周累计长 ${num1(st.range[0])}～${num1(st.range[1])} kg 合适，${st.gain >= 0 ? `现在长了 ${kg(st.gain)} kg` : `现在比孕前轻了 ${kg(-st.gain)} kg`}。${advice}</p>` : ''}
        <p class="gain-about"><span class="gain-key" aria-hidden="true"></span>孕前 BMI ${plan.bmi}，属于${plan.name}：整个孕期建议长 ${num1(plan.total[0])}～${num1(plan.total[1])} kg，孕中晚期每周 ${plan.weekly[0]}～${plan.weekly[1]} kg。曲线上浅绿色的一片是推荐范围。</p>
      </div>`;
  }

  function viewWeights(today) {
    const ws = M.weightSummary(app.state, today);
    const list = app.state.weights.slice().reverse();
    const shown = ui.showAllWeights ? list : list.slice(0, WEIGHTS_SHOWN);
    const due = app.state.profile.dueDate;
    let meta = '还没有记录';
    if (ws.latest) meta = `最近 ${kg(ws.latest.kg)} kg${ws.gain != null ? ` · 孕期累计 ${kgDiff(ws.gain)} kg` : ''} · 共 ${list.length} 条`;

    const rows = shown.map((w, i) => {
      const prev = list[i + 1];
      const d = prev ? M.round2(w.kg - prev.kg) : null;
      const ga = D.gestation(due, w.date).days;
      return `
        <li class="wl-row">
          <span class="wl-date">${D.formatDate(w.date, { relativeTo: today })}<small>${ga >= 0 ? `孕 ${D.formatGA(ga)} 周` : '孕前'}</small></span>
          <span class="wl-kg">${kg(w.kg)}<small>kg</small></span>
          <span class="wl-diff${d > 0 ? ' up' : d < 0 ? ' down' : ''}">${d == null ? '' : kgDiff(d)}</span>
          <button type="button" class="icon-btn icon-btn-sm" data-action="delete-weight" data-date="${w.date}" aria-label="删除 ${D.formatDate(w.date)} 的记录" title="删除">${A.icon.x}</button>
        </li>`;
    }).join('');

    return `
      <article class="card card-weight">
        <header class="card-head">
          <div>
            <h2 class="card-title">${A.icon.scale}体重</h2>
            <p class="card-meta">${meta}</p>
          </div>
        </header>
        ${viewGainPlan(today)}
        <div class="weight-layout">
          <div class="weight-chart-box">
            ${list.length
              ? '<div class="chart" id="weight-chart"></div>'
              : `<div class="empty"><span class="empty-art">${A.honeyPot}</span><p>还没有体重记录。<br>建议每周固定一天，早上空腹称一次。</p></div>`}
          </div>
          <div class="weight-side">
            <form class="weight-form" data-form="add-weight" novalidate>
              <label class="field"><span>日期</span><input type="date" id="w-date" name="date" value="${today}" max="${today}" data-keep></label>
              <label class="field"><span>体重 kg</span><input id="w-kg" name="kg" inputmode="decimal" autocomplete="off" placeholder="56.2" data-keep></label>
              <button class="btn">记一笔</button>
            </form>
            ${rows ? `<ul class="weight-list">${rows}</ul>` : ''}
            ${list.length > WEIGHTS_SHOWN ? `<button type="button" class="link link-more" data-action="toggle-weights">${ui.showAllWeights ? '收起' : `显示全部 ${list.length} 条`}</button>` : ''}
            ${!app.state.baby && M.gainPlan(app.state.profile)?.applies ? '<p class="fineprint">推荐值按《妊娠期妇女体重增长推荐值标准》（WS/T 801—2022），算的是单胎；双胎或者有妊娠期并发症的，听医生的。</p>' : ''}
          </div>
        </div>
      </article>`;
  }

  function viewMeds(today, ga) {
    const rows = M.medRows(app.state, today);
    const meta = rows.length ? `正在吃 ${rows.filter((r) => r.ongoing).length} 样 · 一共记了 ${rows.length} 样` : '还没有记录';
    const head = `
        <header class="card-head">
          <div>
            <h2 class="card-title">${A.icon.pill}用药与补剂</h2>
            <p class="card-meta">${meta}</p>
          </div>
          ${rows.length ? `<div class="card-actions"><button type="button" class="btn btn-ghost btn-sm" data-action="add-med">${A.icon.plus}添加</button></div>` : ''}
        </header>`;
    if (!rows.length) {
      return `
        <article class="card card-meds">
          ${head}
          <div class="empty empty-compact">
            <span class="empty-art empty-icon">${A.icon.pill}</span>
            <p>孕期吃过的药和补剂都可以记在这里，会按孕早、中、晚期排好。<br>产检时医生问起，翻出来就能看。</p>
            <button type="button" class="btn btn-ghost btn-sm" data-action="add-med">${A.icon.plus}记第一样</button>
          </div>
        </article>`;
    }

    const tl = M.medTimeline(rows, ga.days);
    const pos = (d) => clamp01((d - tl.from) / (tl.to - tl.from)) * 100;
    const bar = (from, to, cls) => `<i class="${cls}" style="left:${pos(from).toFixed(2)}%;width:${(pos(to) - pos(from)).toFixed(2)}%"></i>`;
    const stages = M.MED_STAGES
      .map((s) => ({ ...s, from: Math.max(s.from, tl.from), to: Math.min(s.to, tl.to), count: rows.filter((r) => r.stages.includes(s.id)).length }))
      .filter((s) => s.to > s.from);
    const focus = stages.find((s) => s.id === ui.medStage && s.count) || null;
    // 汇总按先后说；下面的列表倒过来，最近开始吃的在最上面
    const shown = focus ? rows.filter((r) => r.stages.includes(focus.id)) : rows;
    const isFocus = (s) => (focus && focus.id === s.id ? ' class="is-focus"' : '');

    const chip = (id, label, count) => `
      <button type="button" class="chip" data-action="med-stage" data-stage="${id}" aria-pressed="${(focus ? focus.id : 'all') === id}"${count ? '' : ' disabled'}>${label}<small>${count}</small></button>`;
    let summary = '';
    if (focus) {
      const ranges = { t1: '1–13 周', t2: '14–27 周', t3: '28 周起' };
      const names = [...new Set(shown.map((r) => r.med.name))];
      summary = `<p class="med-summary">${focus.name}${ranges[focus.id] ? `（${ranges[focus.id]}）` : ''}吃过 ${names.length} 样：${names.map(esc).join('、')}</p>`;
    }

    const row = (r) => {
      const m = r.med;
      const id = esc(m.id);
      const extra = [m.dose, m.note].filter(Boolean).map(esc).join(' · ');
      const when = `${D.formatDate(m.start, { relativeTo: today })} – ${m.end ? D.formatDate(m.end, { relativeTo: today }) : '至今'}`;
      const span = r.ongoing
        ? `${r.startGA < 0 ? '孕前' : `${D.formatGA(r.startGA)} 周`}起 · 已经 ${r.days} 天`
        : `${gaSpan(r.startGA, r.untilGA)} · 共 ${r.days} 天`;
      const planned = r.endGA != null && r.endGA > r.untilGA ? bar(r.untilGA + 1, r.endGA + 1, 'med-bar med-bar-plan') : '';
      return `
        <li class="med med-${m.kind}">
          <div class="med-head">
            <div class="med-main">
              <p class="med-name">${esc(m.name)}<span class="tag${m.kind === 'medicine' ? ' tag-med' : ''}">${m.kind === 'medicine' ? '药物' : '补剂'}</span>${r.ongoing ? '<span class="tag tag-booked">在吃</span>' : ''}</p>
              ${extra ? `<p class="med-extra">${extra}</p>` : ''}
            </div>
            <div class="med-side">
              <div>
                <p class="med-when">${when}</p>
                <p class="med-ga">${span}</p>
              </div>
              <div class="med-actions">
                ${r.ongoing ? `<button type="button" class="chip" data-action="stop-med" data-id="${id}">今天停了</button>` : ''}
                <button type="button" class="chip" data-action="edit-med" data-id="${id}">编辑</button>
              </div>
            </div>
          </div>
          <div class="med-track" aria-hidden="true">
            ${stages.map((s) => `<span${isFocus(s)} style="flex:${s.to - s.from}"></span>`).join('')}
            ${bar(r.startGA, r.untilGA + 1, 'med-bar')}
            ${planned}
            <i class="med-today" style="left:${pos(ga.days + 0.5).toFixed(2)}%"></i>
          </div>
        </li>`;
    };

    return `
      <article class="card card-meds">
        ${head}
        <div class="med-filter" role="group" aria-label="按阶段看">
          ${chip('all', '全部', rows.length)}${stages.map((s) => chip(s.id, s.name, s.count)).join('')}
        </div>
        ${summary}
        <div class="med-axis" aria-hidden="true">${stages.map((s) => `<span${isFocus(s)} style="flex:${s.to - s.from}">${s.name}</span>`).join('')}</div>
        <ul class="med-list">${shown.slice().reverse().map(row).join('')}</ul>
        <p class="fineprint">这里只做记录，吃什么、吃多少请遵医嘱。</p>
      </article>`;
  }

  /** 孕龄范围的写法：孕前 – 12 周、5⁺²–10 周 */
  function gaSpan(from, to) {
    if (to < 0) return '孕前';
    if (from === to) return `${D.formatGA(from)} 周`;
    return `${from < 0 ? '孕前 – ' : `${D.formatGA(from)}–`}${D.formatGA(to)} 周`;
  }

  // ---------- 妈妈的变化 ----------

  function viewMom(ga) {
    const m = C.momAt(Math.max(ga.weeks, 0));
    return `
      <article class="card card-mom">
        <header class="card-head">
          <div>
            <h2 class="card-title">${A.icon.heart}妈妈这周</h2>
            <p class="card-meta">孕 ${Math.max(ga.weeks, 0)} 周常见的身体变化</p>
          </div>
          <div class="card-actions"><a class="btn btn-ghost btn-sm" href="#/tools/weeks">每周都看看</a></div>
        </header>
        <p class="mom-body">${esc(m.body)}</p>
        <p class="mom-care">${A.icon.leaf}<span>${esc(m.care)}</span></p>
      </article>`;
  }

  function viewWeeks(ga) {
    const week = Math.max(ga.weeks, 0);
    const items = C.MOM.map(([from, to, body, care]) => {
      const now = week >= from && week <= to;
      const label = to >= 99 ? `${from} 周以后` : `${Math.max(from, 1)}–${to} 周`;
      const sizes = C.SIZES.filter((s) => s.week >= from && s.week <= to);
      return `
        <li class="wk${now ? ' is-now' : ''}"${now ? ' id="wk-now"' : ''}>
          <h3 class="wk-range">${label}${now ? '<span class="tag tag-next">现在</span>' : ''}</h3>
          ${sizes.length ? `<p class="wk-sizes">${sizes.map((s) => `<span class="wk-size${s.week === week ? ' is-now' : ''}"><span aria-hidden="true">${s.icon}</span>${s.week} 周 · ${esc(s.name)}</span>`).join('')}</p>` : ''}
          <p class="wk-body">${esc(body)}</p>
          <p class="wk-care">${A.icon.leaf}<span>${esc(care)}</span></p>
        </li>`;
    }).join('');
    return `
      <article class="card card-weeks">
        <p class="tool-lead">每个阶段妈妈身体的变化和宝宝的大小，提前知道就不慌。</p>
        <ol class="wk-list">${items}</ol>
        <p class="fineprint">每个人的感受差别很大，没出现或者早一点晚一点都正常；有不舒服拿不准的，问问医生。</p>
      </article>`;
  }

  // ---------- 血压 ----------

  const BP_TAGS = { ok: '正常', high: '偏高', severe: '很高', low: '偏低' };

  function viewBp(today) {
    const sum = M.bpSummary(app.state, today);
    const list = app.state.bp.slice().reverse();
    const meta = list.length ? `最近 7 天量了 ${sum.count} 次${sum.high ? ` · ${sum.high} 次偏高` : ''} · 共 ${list.length} 条` : '还没有记录';
    const level = sum.latest ? M.bpLevel(sum.latest) : 'ok';
    const alert = {
      severe: '最近一次 ≥160/110，很高了。静坐 5 分钟再量一次，还是这么高就马上去医院。',
      high: '最近一次 ≥140/90，偏高。静坐休息后再量；隔 4 小时两次都偏高，或者有头痛、眼花、上腹痛、突然浮肿，尽快去医院。',
      low: '最近一次偏低（低于 90/60）。起身慢一点；头晕、心慌、眼前发黑要告诉医生。',
    }[level];
    const rows = list.slice(0, 30).map((r) => {
      const lv = M.bpLevel(r);
      return `
        <li class="rec-row is-${lv}">
          <span class="rec-when">${D.formatDate(r.date, { relativeTo: today })}<small>${r.time || ''}</small></span>
          <span class="rec-val"><b>${r.sys}/${r.dia}</b><small>${r.pulse ? `心率 ${r.pulse}` : 'mmHg'}</small></span>
          <span class="tag tag-lv-${lv}">${BP_TAGS[lv]}</span>
          <button type="button" class="icon-btn icon-btn-sm" data-action="delete-bp" data-id="${esc(r.id)}" aria-label="删除 ${D.formatDate(r.date)} ${r.sys}/${r.dia} 这条" title="删除">${A.icon.x}</button>
        </li>`;
    }).join('');
    return `
      <article class="card card-bp">
        <header class="card-head">
          <div>
            <h2 class="card-title">${A.icon.heartPulse}血压</h2>
            <p class="card-meta">${meta}</p>
          </div>
        </header>
        ${alert ? `<p class="rec-alert rec-alert-${level}">${A.icon.alert}<span>${alert}</span></p>` : ''}
        <form class="rec-form bp-form" data-form="add-bp" novalidate>
          <div class="field-row">
            <label class="field"><span>日期</span><input type="date" id="bp-date" name="date" value="${today}" max="${today}" data-keep></label>
            <label class="field"><span>时间</span><input type="time" id="bp-time" name="time" value="${hhmm(Date.now())}" data-keep></label>
          </div>
          <div class="bp-nums">
            <label class="field"><span>高压</span><input id="bp-sys" name="sys" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="115" data-keep></label>
            <span class="bp-slash" aria-hidden="true">/</span>
            <label class="field"><span>低压</span><input id="bp-dia" name="dia" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="75" data-keep></label>
            <label class="field"><span>心率 <small>可选</small></span><input id="bp-pulse" name="pulse" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="80" data-keep></label>
          </div>
          <p class="form-error" hidden></p>
          <button class="btn btn-block">记一笔</button>
        </form>
        ${list.length >= 2 ? `
          <div class="chart" id="bp-chart"></div>
          <p class="bp-legend"><span class="bp-key"></span>高压 <span class="bp-key bp-key-2"></span>低压 <span class="bp-key bp-key-guide"></span>140/90 参考线</p>` : ''}
        ${rows ? `<ul class="rec-list">${rows}</ul>` : `<div class="empty empty-compact"><span class="empty-art empty-icon">${A.icon.heartPulse}</span><p>孕中晚期每次产检都会量血压。<br>医生让在家监测的话，记在这里，复诊时给医生看。</p></div>`}
        <p class="fineprint">怎么量：安静坐 5 分钟，手臂和心脏一样高，袖带绑在上臂；每天固定时间量，连量两次取平均。140/90 及以上算偏高，以医生的判断为准。</p>
      </article>`;
  }

  // ---------- 血糖 ----------

  const GL_TAGS = { high: '偏高', low: '偏低' };

  /** 按现在几点猜一个最可能的测量时间点 */
  function guessSlot(hour) {
    if (hour < 5 || hour >= 21) return 'night';
    if (hour < 9) return 'fasting';
    if (hour < 11) return 'breakfast';
    if (hour < 16) return 'lunch';
    return 'dinner';
  }

  const glText = (v) => v.toFixed(1);

  function viewGlucose(today) {
    const after = app.state.prefs.glucoseAfter;
    const sum = M.glucoseSummary(app.state, today);
    const days = M.glucoseDays(app.state);
    const values = new Map(days.map((d) => [d.date, d.values]));
    const dates = Array.from({ length: 7 }, (_, i) => D.addDays(today, -i));
    for (const d of days) if (d.date < dates[6]) dates.push(d.date);
    const slot = ui.glucoseSlot || guessSlot(new Date().getHours());

    let meta = '还没有记录';
    if (app.state.glucose.length) {
      meta = `最近 7 天测了 ${sum.count} 次${sum.high ? ` · ${sum.high} 次偏高` : ''}${sum.low ? ` · ${sum.low} 次偏低` : ''}`;
    }
    const alerts = [];
    if (sum.high >= 2) alerts.push(['high', `最近 7 天有 ${sum.high} 次超过目标。下次产检把这张表给医生看；已经确诊妊娠糖尿病的，按医生说的调整饮食和运动。`]);
    if (sum.low) alerts.push(['low', '有低于 3.3 的记录。低血糖会心慌、出汗、手抖，随身带几块糖；经常出现要告诉医生。']);

    const head = `<tr><th scope="col">日期</th>${C.GLUCOSE_SLOTS.map((s) => `<th scope="col">${s.short}</th>`).join('')}</tr>`;
    const body = dates.map((date) => {
      const v = values.get(date) || {};
      const cells = C.GLUCOSE_SLOTS.map((s) => {
        const value = v[s.id];
        const lv = value == null ? 'none' : M.glucoseLevel(value, s.id, after);
        const label = `${D.formatDate(date)} ${s.name}${value == null ? '，还没记' : ` ${glText(value)}${GL_TAGS[lv] ? `，${GL_TAGS[lv]}` : ''}`}`;
        return `<td><button type="button" class="gl-cell is-${lv}" data-action="edit-glucose" data-date="${date}" data-slot="${s.id}" aria-label="${label}">${value == null ? '' : glText(value)}</button></td>`;
      }).join('');
      return `<tr${date === today ? ' class="is-today"' : ''}><th scope="row">${D.formatDate(date, { relativeTo: today })}</th>${cells}</tr>`;
    }).join('');

    const afterBtn = (n) => `<button type="button" class="chip" data-action="glucose-after" data-after="${n}" aria-pressed="${after === n}">餐后 ${n} 小时</button>`;
    return `
      <article class="card card-glucose">
        <header class="card-head">
          <div>
            <h2 class="card-title">${A.icon.drop}血糖</h2>
            <p class="card-meta">${meta}</p>
          </div>
        </header>
        ${alerts.map(([lv, text]) => `<p class="rec-alert rec-alert-${lv}">${A.icon.alert}<span>${text}</span></p>`).join('')}
        <form class="rec-form gl-form" data-form="add-glucose" novalidate>
          <div class="gl-slots" role="radiogroup" aria-label="什么时候测的">
            ${C.GLUCOSE_SLOTS.map((s) => `<label class="pick"><input type="radio" name="slot" value="${s.id}"${s.id === slot ? ' checked' : ''}><span>${s.name}</span></label>`).join('')}
          </div>
          <div class="gl-row">
            <label class="field"><span>日期</span><input type="date" id="gl-date" name="date" value="${today}" max="${today}" data-keep></label>
            <label class="field"><span>血糖 <small>mmol/L</small></span><input id="gl-value" name="value" inputmode="decimal" autocomplete="off" placeholder="5.2" data-keep></label>
          </div>
          <p class="form-error" hidden></p>
          <button class="btn btn-block">记一笔</button>
        </form>
        <div class="gl-target">
          <div class="gl-after" role="group" aria-label="餐后按几小时测">${afterBtn(1)}${afterBtn(2)}</div>
          <p>目标：空腹 ≤5.3 · 餐后 ${after} 小时 ≤${M.glucoseTarget('lunch', after)} · 睡前 ≤6.7</p>
        </div>
        <div class="gl-wrap">
          <table class="gl-table">
            <thead>${head}</thead>
            <tbody>${body}</tbody>
          </table>
        </div>
        <p class="gl-legend"><span class="gl-key is-high"></span>超过目标 <span class="gl-key is-low"></span>低于 3.3 · 点格子可以改</p>
        <p class="fineprint">餐后时间从吃第一口饭算起。目标值参考《妊娠期高血糖诊治指南（2022）》，医生另有要求的按医生的。</p>
      </article>`;
  }

  /** 每周变化页打开时直接停在现在这一段 */
  function scrollToNow() {
    const el = document.getElementById('wk-now');
    if (el) el.scrollIntoView({ block: 'start' });
    return Boolean(el);
  }

  Object.assign(app, { viewWeights, viewMeds, viewMom, viewWeeks, viewBp, GL_TAGS, glText, viewGlucose, scrollToNow });
})();
