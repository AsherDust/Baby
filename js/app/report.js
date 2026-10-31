(function () {
  'use strict';
  // 「就诊小结」：给医生看的一页，能打印、能存成 PDF。
  // 孕期是体重、血压、血糖、用药、B 超和产检；宝宝出生后是生长、最近 7 天吃睡拉、体温用药、疫苗体检和辅食反应
  const {
    dates: D, content: C, model: M, chart: Chart, baby: Bb, babyBook: BB, babyFood: FOOD, growthStandard: STD, journal: J, art: A, app,
  } = globalThis.Baby;
  const { esc, ui, kg, kgDiff } = app;

  const W = 640;
  const row = (label, value) => (value ? `<tr><th>${label}</th><td>${value}</td></tr>` : '');
  // 没有记录的一块整个不显示
  const part = (title, body, note = '') => (body ? `
    <section class="rp-part">
      <h2>${title}</h2>
      ${body}
      ${note ? `<p class="rp-note">${note}</p>` : ''}
    </section>` : '');
  const table = (head, rows) => `<table class="rp-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
  const num1 = (n) => String(Math.round(n * 10) / 10);

  function viewReportTool() {
    const b = app.state.baby;
    const name = esc((b && b.name) || app.state.profile.nickname || '宝宝');
    return `
      <div class="rp-actions">
        <p>${A.icon.notes}<span>产检、儿保或者看病时，把这一页给医生看。手机上点下面的按钮，在打印的页面里可以存成 PDF。</span></p>
        <button type="button" class="btn" id="report-print" data-action="print-report">打印或存成 PDF</button>
      </div>
      <article class="card report" id="report">
        <header class="rp-head">
          <h1>${b ? `${name}的就诊小结` : '孕期就诊小结'}</h1>
          <p>${D.formatDate(ui.today, { year: true, weekday: true })} 从「蜜罐」导出</p>
        </header>
        ${b ? babyReport(b, name) : pregnancyReport()}
        <p class="rp-foot">以上是家里自己记的，只做参考，以医院的检查为准。</p>
      </article>`;
  }

  // ---------- 孕期 ----------

  function pregnancyReport() {
    const s = app.state;
    const p = s.profile;
    const today = ui.today;
    const ga = D.gestation(p.dueDate, today);
    const plan = M.gainPlan(p);
    const ws = M.weightSummary(s, today);
    const gain = M.gainStatus(s, today);
    const basics = `
      <table class="rp-kv">
        ${row('预产期', D.formatDate(p.dueDate, { year: true }))}
        ${row('今天', ga.days >= 0 ? `孕 ${D.formatGA(ga.days)} 周` : '')}
        ${row('孕前体重', p.preWeight != null ? `${kg(p.preWeight)} kg` : '')}
        ${row('身高', p.height != null ? `${p.height} cm` : '')}
        ${row('孕前 BMI', plan && plan.applies ? `${plan.bmi}（${plan.name}，整个孕期建议长 ${plan.total[0]}～${plan.total[1]} kg）` : '')}
      </table>`;

    let weight = '';
    if (ws.latest) {
      const level = gain ? `，${{ ok: '在推荐范围内', high: '比推荐长得快', low: '比推荐长得慢' }[gain.level]}（这时推荐累计 ${num1(gain.range[0])}～${num1(gain.range[1])} kg）` : '';
      weight = `
        <p>最近一次 ${D.formatDate(ws.latest.date, { year: true })}：<b>${kg(ws.latest.kg)} kg</b>${ws.gain != null ? `，孕期累计 ${kgDiff(ws.gain)} kg${level}` : ''}。</p>
        <div class="rp-chart">${Chart.weight({ weights: s.weights, dueDate: p.dueDate, preWeight: p.preWeight, plan: plan && plan.applies ? plan : null, today, width: W, height: 240 })}</div>`;
    }

    const bp = s.bp.filter((r) => r.date <= today).slice(-14).reverse();
    const bpSum = M.bpSummary(s, today);
    const bpTable = bp.length
      ? table(['日期', '血压', '心率', '备注'], bp.map((r) => {
        const level = M.bpLevel(r);
        return `<tr class="${level === 'high' || level === 'severe' ? 'rp-high' : ''}"><td>${D.formatDate(r.date)} ${r.time}</td><td>${r.sys}/${r.dia}</td><td>${r.pulse || ''}</td><td>${esc(r.note || '')}</td></tr>`;
      }))
      : '';

    const after = s.prefs.glucoseAfter;
    const since = D.addDays(today, -6);
    const days = M.glucoseDays(s).filter((d) => d.date >= since && d.date <= today);
    const glSum = M.glucoseSummary(s, today);
    const glTable = days.length
      ? table(['日期', ...C.GLUCOSE_SLOTS.map((g) => g.short)], days.map((d) => `<tr><td>${D.formatDate(d.date)}</td>${C.GLUCOSE_SLOTS.map((g) => {
        const v = d.values[g.id];
        if (v == null) return '<td></td>';
        const level = M.glucoseLevel(v, g.id, after);
        return `<td class="${level === 'ok' ? '' : `rp-${level}`}">${v}</td>`;
      }).join('')}</tr>`))
      : '';

    // 药：怀孕以来吃过的都列上，停了很久的医生也要知道；补剂：正在吃的和最近一个月停掉的
    const monthAgo = D.addDays(today, -30);
    const rows = M.medRows(s, today);
    const gaOf = (d) => (d < 0 ? '孕前' : D.formatGA(d));
    const drugs = rows.filter((r) => r.med.kind === 'medicine' && (r.ongoing || r.endGA >= 0));
    const drugTable = drugs.length
      ? table(['药和用法', '什么时候', '备注'], drugs.map((r) => {
        const day = (date) => `<span class="rp-day">${D.formatDate(date)}</span>`;
        const when = r.ongoing
          ? `${day(r.med.start)}起，还在吃<br><small>孕 ${gaOf(r.startGA)} 周起</small>`
          : `${day(r.med.start)}～${day(r.med.end)}<br><small>孕 ${gaOf(r.startGA)}～${gaOf(r.endGA)} 周</small>`;
        return `<tr><td>${esc(r.med.name)}${r.med.dose ? `<br><small>${esc(r.med.dose)}</small>` : ''}</td><td>${when}</td><td>${esc(r.med.note)}</td></tr>`;
      }))
      : '';
    const supplements = rows.filter((r) => r.med.kind !== 'medicine' && (r.ongoing || (r.med.end && r.med.end >= monthAgo)));
    const supplementTable = supplements.length
      ? table(['补剂', '用法', '从', '到'], supplements.map((r) => `<tr><td>${esc(r.med.name)}</td><td>${esc(r.med.dose)}</td><td>${D.formatDate(r.med.start)}</td><td>${r.ongoing ? '还在吃' : D.formatDate(r.med.end)}</td></tr>`))
      : '';

    const us = s.ultrasounds.filter((u) => u.date <= today).slice(-1)[0];
    let usBody = '';
    if (us) {
      const fields = C.US_FIELDS.filter((f) => us.values[f.id] != null);
      usBody = `
        <p>${D.formatDate(us.date, { year: true })}（孕 ${D.formatGA(D.gestation(p.dueDate, us.date).days)} 周）</p>
        <table class="rp-kv">${fields.map((f) => row(`${f.name} ${f.abbr}`, `${us.values[f.id]} ${f.unit}`)).join('')}${row('胎盘', esc(us.placenta || ''))}${row('备注', esc(us.note || ''))}</table>`;
    }

    const next = M.nextCheckup(M.scheduleRows(s, today));
    const care = J.careCheck(s.journal, today);
    const others = [
      next ? `下一次产检：${esc(next.ck.title)}，${D.formatDate(next.status.date, { weekday: true })}${next.status.booked ? '（约好了）' : '（按孕周推算）'}` : '',
      care.days ? `最近两周有 ${care.days} 天记了心情低落或焦虑` : '',
    ].filter(Boolean);

    return `
      ${part('基本情况', basics)}
      ${part('体重', weight)}
      ${part('血压', bpTable, `最近 7 天量了 ${bpSum.count} 次${bpSum.high ? `，${bpSum.high} 次偏高（≥140/90）` : ''}；标红的是偏高的。`)}
      ${part('血糖（mmol/L）', glTable, `餐后按 ${after} 小时测；目标空腹 ≤5.3，餐后 ≤${M.glucoseTarget('breakfast', after)}，睡前 ≤6.7。最近 7 天 ${glSum.high} 次偏高${glSum.low ? `、${glSum.low} 次偏低` : ''}，标红的是超出目标的。`)}
      ${part('用药', drugTable, '怀孕以来吃过的药都在这里，包括已经停了的。')}
      ${part('补剂', supplementTable, '正在吃的，和最近一个月停掉的。')}
      ${part('最近一次 B 超', usBody)}
      ${others.length ? part('其它', `<ul class="rp-list">${others.map((t) => `<li>${t}</li>`).join('')}</ul>`) : ''}`;
  }

  // ---------- 宝宝 ----------

  function babyReport(b, name) {
    const today = ui.today;
    const now = Date.now();
    const age = Bb.ageOf(b.birthDate, today);
    const birth = b.growth.find((g) => g.date === b.birthDate);
    const basics = `
      <table class="rp-kv">
        ${row('小名', name)}
        ${row('性别', b.sex === 'boy' ? '男' : '女')}
        ${row('出生', `${D.formatDate(b.birthDate, { year: true })}${b.birthTime ? ` ${b.birthTime}` : ''}，今天 ${Bb.ageText(age)}`)}
        ${row('出生时', birth ? Bb.METRICS.filter((m) => birth[m.id] != null).map((m) => `${m.name} ${birth[m.id]} ${m.unit}`).join('，') : '')}
      </table>`;

    const rows = Bb.growthRows(b, STD);
    const latest = rows[rows.length - 1];
    let growth = '';
    if (latest) {
      const maxDay = Math.min(730, Math.max(183, age.days + 61));
      const chart = (metric) => {
        const m = Bb.METRICS.find((x) => x.id === metric);
        const points = rows.filter((r) => r[metric] != null && r.day <= maxDay).map((r) => ({ day: r.day, value: r[metric], date: r.date }));
        return points.length ? `<figure class="rp-chart"><figcaption>${m.name}（${m.unit}）</figcaption>${Chart.growth({ curves: Bb.curves(STD, metric, b.sex, maxDay), points, unit: m.unit, label: `${m.name}生长曲线`, width: W, height: 220 })}</figure>` : '';
      };
      growth = `
        ${table(['日期', '月龄', ...Bb.METRICS.map((m) => `${m.name} ${m.unit}`)], rows.slice(-4).reverse().map((r) => `<tr><td>${D.formatDate(r.date, { relativeTo: today })}</td><td>${Bb.ageText(Bb.ageOf(b.birthDate, r.date))}</td>${Bb.METRICS.map((m) => `<td>${r[m.id] == null ? '' : `${r[m.id]}${r.z[m.id] == null ? '' : `（P${Bb.percentile(r.z[m.id])}）`}`}</td>`).join('')}</tr>`))}
        <div class="rp-charts">${chart('weight')}${chart('length')}</div>`;
    }

    const week = Bb.weekSummary(b, today, now);
    const weekTable = week.some((d) => d.has)
      ? table(['日期', '喂奶', '睡觉', '尿布'], week.slice().reverse().map((d) => `<tr><td>${D.formatDate(d.date)}${d.date === today ? '（今天）' : ''}</td><td>${d.feeds ? `${d.feeds} 次${d.breastMin ? `，亲喂 ${d.breastMin} 分钟` : ''}${d.bottleMl ? `，瓶喂 ${d.bottleMl} 毫升` : ''}` : ''}</td><td>${d.sleepMin ? `${num1(d.sleepMin / 60)} 小时` : ''}</td><td>${d.diapers ? `${d.diapers} 片（尿 ${d.pee}，便 ${d.poo}）` : ''}</td></tr>`))
      : '';

    const since = D.addDays(today, -13);
    const recent = b.logs.filter((l) => Bb.dayOf(l.start) >= since && Bb.dayOf(l.start) <= today);
    const when = (l) => `${D.formatDate(Bb.dayOf(l.start))} ${app.hhmm(l.start)}`;
    const temps = recent.filter((l) => l.type === 'temp').reverse();
    const siteName = Object.fromEntries(BB.feverSites);
    const tempTable = temps.length
      ? table(['时间', '体温', '量的哪里'], temps.map((l) => `<tr class="${['low', 'mid', 'high'].includes(Bb.tempLevel(BB, l.value, l.site)) ? 'rp-high' : ''}"><td>${when(l)}</td><td>${l.value}℃</td><td>${siteName[l.site] || ''}</td></tr>`))
      : '';
    const meds = recent.filter((l) => l.type === 'med').reverse();
    const medTable = meds.length
      ? table(['时间', '药', '剂量'], meds.map((l) => `<tr><td>${when(l)}</td><td>${esc(l.name)}</td><td>${esc(l.dose)}</td></tr>`))
      : '';

    const vax = Bb.vaccineRows(b, BB, today);
    const nextVax = Bb.nextVaccine(vax);
    const lateVax = vax.filter((r) => r.status === 'late');
    const exams = Bb.examRows(b, BB, today);
    const nextExam = Bb.nextExam(exams);
    const shots = `
      <ul class="rp-list">
        <li>国家免疫规划疫苗打了 ${vax.filter((r) => r.status === 'done').length}/${vax.length} 针${lateVax.length ? `；<b class="rp-high-text">过了建议时间还没打：${lateVax.map((r) => `${r.name}第 ${r.dose} 剂`).join('、')}</b>` : ''}</li>
        ${nextVax ? `<li>下一针：${nextVax.name}第 ${nextVax.dose} 剂，${nextVax.booked ? `约在 ${D.formatDate(nextVax.booked)}` : `${D.formatDate(nextVax.due)}起可以打`}</li>` : ''}
        ${b.extraVaccines.length ? `<li>自费疫苗：${b.extraVaccines.map((v) => `${esc(v.name)}（${D.formatDate(v.date)}${v.done ? '' : '，约好了'}）`).join('、')}</li>` : ''}
        <li>儿保体检做了 ${exams.filter((r) => r.status === 'done').length}/${exams.length} 次${nextExam ? `；下一次：${nextExam.name}，${nextExam.booked ? `约在 ${D.formatDate(nextExam.booked)}` : `${D.formatDate(nextExam.from)}起`}` : ''}</li>
      </ul>`;

    let food = '';
    if (Object.keys(b.tried).length || Object.keys(b.foodNotes).length) {
      const feel = (f) => Object.entries(b.foodNotes).filter(([, v]) => v.feel === f).map(([n, v]) => `${esc(n)}${v.note ? `（${esc(v.note)}）` : ''}`);
      const reacted = feel('reaction');
      food = part('辅食', `
        <ul class="rp-list">
          <li>吃过 ${Object.keys(b.tried).length}/${Bb.foodList(FOOD).length} 样食材</li>
          ${reacted.length ? `<li><b class="rp-high-text">吃了有反应：${reacted.join('、')}</b></li>` : '<li>没有记过吃了有反应的食材</li>'}
          ${feel('dislike').length ? `<li>不爱吃：${feel('dislike').join('、')}</li>` : ''}
        </ul>`);
    }

    return `
      ${part('基本情况', basics)}
      ${part('生长', growth, '括号里是 WHO 儿童生长标准的百分位。')}
      ${part('最近 7 天', weekTable, '按家里记下来的算，没记全的那几天会偏少。')}
      ${part('体温（最近两周）', tempTable)}
      ${part('用药（最近两周）', medTable)}
      ${part('疫苗和体检', shots)}
      ${food}`;
  }

  Object.assign(app, { viewReportTool });
})();
