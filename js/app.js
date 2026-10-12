(function () {
  'use strict';
  const { dates: D, content: C, model: M, storage: S, calendar: Cal, chart: Chart, art: A } = globalThis.Baby;

  const root = document.getElementById('app');
  const toastBox = document.getElementById('toast');
  const settingsDialog = document.getElementById('settings-dialog');
  const checkupDialog = document.getElementById('checkup-dialog');

  const WEIGHTS_SHOWN = 6;
  // 首屏从 32 周起提醒收拾待产包，最好 36 周前备齐
  const BAG_REMIND_FROM = 32 * 7;
  const BAG_READY_BY = 36 * 7;
  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
  const kg = M.formatKg;
  const kgDiff = M.formatKgDiff;
  const clamp01 = (n) => Math.min(Math.max(n, 0), 1);
  const notifyPermission = () => ('Notification' in window ? Notification.permission : 'unsupported');

  let state = S.load();
  const ui = {
    today: D.today(),
    showAllWeights: false,
    bagAdding: null,
    clearInputs: [],
    undo: null,
  };

  function greeting(hour) {
    if (hour < 5) return '夜深了';
    if (hour < 9) return '早上好';
    if (hour < 12) return '上午好';
    if (hour < 14) return '中午好';
    if (hour < 18) return '下午好';
    return '晚上好';
  }

  // ---------- 渲染 ----------

  function render() {
    // 整块重绘会丢掉输入框里没提交的内容，这里先记下来再填回去
    const kept = {};
    root.querySelectorAll('[data-keep]').forEach((el) => {
      if (el.id && !ui.clearInputs.includes(el.id)) kept[el.id] = el.value;
    });
    ui.clearInputs = [];
    const focusId = root.contains(document.activeElement) ? document.activeElement.id : '';

    root.innerHTML = state ? viewDashboard() : viewOnboarding();

    for (const [id, value] of Object.entries(kept)) {
      const el = document.getElementById(id);
      if (el) el.value = value;
    }
    if (focusId) document.getElementById(focusId)?.focus();
    drawChart();

    if (state) {
      const ga = D.gestation(state.profile.dueDate, ui.today);
      document.title = `孕 ${ga.weeks} 周${ga.day ? ` + ${ga.day} 天` : ''} · 孕期工作台`;
    } else {
      document.title = '孕期工作台';
    }
  }

  function viewDashboard() {
    const today = ui.today;
    const due = state.profile.dueDate;
    const ga = D.gestation(due, today);
    const rows = M.scheduleRows(state, today);
    return `
      ${viewHeader(today)}
      ${viewBanner(M.reminders(rows))}
      <section class="hero">
        ${viewWeek(ga, due, today)}
        ${viewBaby(ga)}
        ${viewToday(ga, rows, today)}
      </section>
      ${viewWeights(today)}
      ${viewCheckups(rows, today)}
      ${viewBag(ga)}
      <footer class="foot">
        <span class="foot-bee">${A.bee}</span>
        <p>记录只保存在这台设备的浏览器里，偶尔在设置里导出一份备份更安心。</p>
        <p>宝宝大小是平均参考，每个宝宝都有自己的节奏；产检安排以医院和医生为准。</p>
      </footer>`;
  }

  function viewHeader(today) {
    return `
      <header class="topbar">
        <div class="brand">
          <span class="brand-mark">${A.honeyPot}</span>
          <div>
            <h1 class="brand-title">孕期工作台</h1>
            <p class="brand-sub">慢慢来，一切都刚刚好</p>
          </div>
        </div>
        <div class="topbar-side">
          <p class="topbar-date"><span class="topbar-greet">${greeting(new Date().getHours())}</span>${D.formatDate(today)} 星期${D.weekday(today)}</p>
          <button type="button" class="icon-btn" data-action="open-settings" aria-label="设置" title="设置">${A.icon.sliders}</button>
        </div>
      </header>`;
  }

  function viewBanner(list) {
    if (!list.length) return '';
    return `
      <section class="banner" role="status">
        <span class="banner-bee">${A.bee}</span>
        <div class="banner-list">
          ${list.map(({ ck, status }) => {
            const when = status.diff === 0 ? '今天' : '明天';
            const notes = [ck.prep, status.booked ? '' : '这是按孕周推算的建议日期，约好了记得改成医院给的日子。'].filter(Boolean);
            return `
              <div class="banner-item">
                <div>
                  <p class="banner-title">${when}产检：${esc(ck.title)}${ck.time ? ` · ${ck.time}` : ''}</p>
                  ${notes.map((n) => `<p class="banner-text">${esc(n)}</p>`).join('')}
                </div>
                ${status.diff === 0 ? `<button type="button" class="btn btn-sm" data-action="toggle-done" data-id="${esc(ck.id)}">做完啦</button>` : ''}
              </div>`;
          }).join('')}
        </div>
      </section>`;
  }

  function viewWeek(ga, due, today) {
    const left = D.diffDays(today, due);
    const segments = [[0, 98, '孕早期'], [98, 196, '孕中期'], [196, 280, '孕晚期']];
    const pct = clamp01(ga.days / D.PREGNANCY_DAYS) * 100;
    let countdown = `还有 <b>${left}</b> 天见面`;
    if (left === 0) countdown = '<b>就是今天</b>';
    if (left < 0) countdown = `已过预产期 <b>${-left}</b> 天`;
    return `
      <article class="panel panel-week">
        <span class="panel-comb">${A.honeycomb}</span>
        <p class="eyebrow">${D.TRIMESTER_NAMES[D.trimester(ga.days)]}</p>
        <p class="week-big" aria-label="孕 ${ga.weeks} 周 ${ga.day} 天">
          <span class="num">${Math.max(ga.weeks, 0)}</span><span class="unit">周</span>
          ${ga.day ? `<span class="plus">+</span><span class="num num-sm">${ga.day}</span><span class="unit">天</span>` : ''}
        </p>
        <p class="week-sub">已经怀孕 <b>${Math.max(ga.days, 0)}</b> 天 · ${countdown}</p>
        <div class="journey" aria-hidden="true">
          <div class="journey-track">
            ${segments.map(([s, e]) => `<span class="journey-seg" style="flex:${e - s}"><i style="width:${(clamp01((ga.days - s) / (e - s)) * 100).toFixed(1)}%"></i></span>`).join('')}
            <span class="journey-balloon" style="left:${pct.toFixed(1)}%">${A.balloon}</span>
          </div>
          <div class="journey-labels">${segments.map(([s, e, name]) => `<span style="flex:${e - s}">${name}</span>`).join('')}</div>
        </div>
        <p class="due-line">预产期 <b>${D.formatDate(due, { year: true, weekday: true })}</b><button type="button" class="link" data-action="open-settings">修改</button></p>
      </article>`;
  }

  function viewBaby(ga) {
    const b = C.babyAt(ga.weeks);
    const who = esc(state.profile.nickname) || '宝宝';
    let grams = `${b.grams} 克`;
    if (b.grams < 1) grams = '不到 1 克';
    if (b.grams >= 1000) grams = `${b.grams / 1000} 千克`;
    return `
      <article class="panel panel-baby">
        <p class="eyebrow">宝宝多大</p>
        <div class="baby-row">
          <div class="fruit-plate" aria-hidden="true">
            <span class="fruit">${b.icon}</span>
            <span class="plate-bee">${A.bee}</span>
          </div>
          <div class="baby-text">
            <p class="baby-like">${who}现在差不多像一${b.unit}</p>
            <p class="baby-name">${b.name}</p>
            <p class="baby-stats"><span>${b.week < 20 ? '头臀长' : '身长'}约 ${b.cm} 厘米</span><span>体重约 ${grams}</span></p>
          </div>
        </div>
        <p class="baby-note">${A.icon.leaf}<span>${ga.weeks < 4 ? '还在悄悄准备中，过几天再来看看。' : `本周：${b.note}`}</span></p>
      </article>`;
  }

  function viewToday(ga, rows, today) {
    return `
      <article class="panel panel-today">
        <p class="eyebrow">今天该记</p>
        <ul class="todo">
          ${todoWeight(M.weightSummary(state, today))}
          ${todoCheckup(M.nextCheckup(rows))}
          ${todoBag(ga)}
          <li class="todo-item">
            <span class="todo-icon todo-icon-leaf">${A.icon.leaf}</span>
            <div class="todo-body">
              <p class="todo-title">本周小提醒</p>
              <p class="todo-text">${esc(C.tipAt(ga.weeks))}</p>
            </div>
          </li>
        </ul>
      </article>`;
  }

  function todoWeight(ws) {
    if (ws.todayEntry) {
      const parts = [ws.previous ? `比 ${D.formatDate(ws.previous.date)} ${kgDiff(ws.change)} kg` : '第一条记录，之后就能看到变化啦'];
      if (ws.gain != null) parts.push(`孕期累计 ${kgDiff(ws.gain)} kg`);
      return `
        <li class="todo-item is-done">
          <span class="todo-icon">${A.icon.check}</span>
          <div class="todo-body">
            <p class="todo-title">体重记好了 <b class="todo-figure">${kg(ws.todayEntry.kg)}</b> kg</p>
            <p class="todo-text">${parts.join(' · ')}</p>
          </div>
        </li>`;
    }
    const hint = ws.latest
      ? `上次记录：${D.formatRelative(-ws.daysSinceLast)} ${kg(ws.latest.kg)} kg`
      : '建议每周固定一天，早上空腹称一次';
    return `
      <li class="todo-item">
        <span class="todo-icon">${A.icon.scale}</span>
        <div class="todo-body">
          <p class="todo-title">称个体重</p>
          <form class="quick-form" data-form="quick-weight" novalidate>
            <input id="quick-kg" name="kg" inputmode="decimal" autocomplete="off" placeholder="${ws.latest ? kg(ws.latest.kg) : '56.2'}" aria-label="今天的体重（千克）" data-keep>
            <span class="unit-label">kg</span>
            <button class="btn btn-sm">记下</button>
          </form>
          <p class="todo-text">${hint}</p>
        </div>
      </li>`;
  }

  function todoCheckup(next) {
    if (!next) {
      return `
        <li class="todo-item is-done">
          <span class="todo-icon">${A.icon.check}</span>
          <div class="todo-body"><p class="todo-title">产检都安排完啦</p><p class="todo-text">接下来好好休息，等宝宝来见面。</p></div>
        </li>`;
    }
    const { ck, status } = next;
    const id = esc(ck.id);
    const when = `${D.formatDate(status.date, { weekday: true })}${ck.time ? ` ${ck.time}` : ''}`;
    let iconClass = '';
    let title;
    let text;
    let action = '';
    if (status.kind === 'today') {
      iconClass = ' todo-icon-alert';
      title = `今天产检：${esc(ck.title)}${ck.time ? ` · ${ck.time}` : ''}`;
      text = esc(ck.prep || ck.items.join('、'));
      action = `<button type="button" class="btn btn-sm" data-action="toggle-done" data-id="${id}">做完啦</button>`;
    } else if (status.kind === 'open') {
      iconClass = ' todo-icon-alert';
      title = `${esc(ck.title)}：${status.daysLeft ? `窗口期还剩 ${status.daysLeft} 天` : '今天是窗口期最后一天'}`;
      text = '还没定日期，记得尽快约上';
      action = `<button type="button" class="btn btn-ghost btn-sm" data-action="edit-checkup" data-id="${id}">填日期</button>`;
    } else {
      title = `${status.diff === 1 ? '明天产检' : '下次产检'}：${esc(ck.title)}`;
      text = `${when} · ${D.formatRelative(status.diff)}${status.booked ? '' : '（建议日期）'}`;
      if (status.diff === 1 && ck.prep) text += `<br>${esc(ck.prep)}`;
      if (!status.booked) action = `<button type="button" class="btn btn-ghost btn-sm" data-action="edit-checkup" data-id="${id}">填预约日期</button>`;
    }
    return `
      <li class="todo-item">
        <span class="todo-icon${iconClass}">${A.icon.calendarHeart}</span>
        <div class="todo-body">
          <p class="todo-title">${title}</p>
          <p class="todo-text">${text}</p>
          ${action ? `<div class="todo-actions">${action}</div>` : ''}
        </div>
      </li>`;
  }

  function todoBag(ga) {
    const sum = M.bagSummary(state);
    if (ga.days < BAG_REMIND_FROM || !sum.total) return '';
    if (!sum.left) {
      return `
        <li class="todo-item is-done">
          <span class="todo-icon">${A.icon.check}</span>
          <div class="todo-body"><p class="todo-title">待产包备齐了</p><p class="todo-text">放在门口，到时候拎起就走。</p></div>
        </li>`;
    }
    return `
      <li class="todo-item">
        <span class="todo-icon${ga.days >= BAG_READY_BY ? ' todo-icon-alert' : ''}">${A.icon.suitcase}</span>
        <div class="todo-body">
          <p class="todo-title">待产包还差 ${sum.left} 样</p>
          <p class="todo-text">${bagTiming(ga)} · <button type="button" class="link" data-action="scroll-to-bag">去打勾</button></p>
        </div>
      </li>`;
  }

  function bagTiming(ga) {
    if (ga.days < BAG_REMIND_FROM) return '一般 32 周起慢慢收拾，36 周前备齐';
    if (ga.days < BAG_READY_BY) return `最好 36 周前备齐，还有 ${BAG_READY_BY - ga.days} 天`;
    return '快足月了，尽快备齐，证件放在最上面';
  }

  function viewWeights(today) {
    const ws = M.weightSummary(state, today);
    const list = state.weights.slice().reverse();
    const shown = ui.showAllWeights ? list : list.slice(0, WEIGHTS_SHOWN);
    const due = state.profile.dueDate;
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
            ${state.profile.preWeight == null ? '<p class="fineprint">在设置里填上孕前体重，就能看到孕期一共长了多少。</p>' : ''}
          </div>
        </div>
      </article>`;
  }

  function viewCheckups(rows, today) {
    const next = M.nextCheckup(rows);
    const done = rows.filter((r) => r.ck.done).length;
    const past = rows.filter((r) => r.status.kind === 'past').length;
    const groups = [1, 2, 3]
      .map((t) => ({ t, rows: rows.filter((r) => D.trimester(r.status.ga) === t) }))
      .filter((g) => g.rows.length);
    const ranges = { 1: '1–13 周', 2: '14–27 周', 3: '28 周起' };

    return `
      <article class="card card-checkups">
        <header class="card-head">
          <div>
            <h2 class="card-title">${A.icon.calendarHeart}产检日程</h2>
            <p class="card-meta">按孕周排好 · 已完成 ${done}/${rows.length}</p>
          </div>
          <div class="card-actions">
            <button type="button" class="btn btn-ghost btn-sm" data-action="add-checkup">${A.icon.plus}添加</button>
            <button type="button" class="btn btn-ghost btn-sm" data-action="export-ics">${A.icon.calendarPlus}导入日历</button>
          </div>
        </header>
        ${viewRemindStrip()}
        ${past ? `
          <div class="past-strip">
            <span>有 ${past} 次产检的日期已经过了，还没标完成。</span>
            <button type="button" class="btn btn-ghost btn-sm" data-action="mark-past-done">都标为完成</button>
          </div>` : ''}
        <div class="timeline">
          ${groups.map((g) => `
            <section class="tl-group">
              <h3 class="tl-title">${D.TRIMESTER_NAMES[g.t]}<small>${ranges[g.t]}</small></h3>
              <ol class="tl-list">${g.rows.map((r) => viewCheckupRow(r, next !== null && r.ck.id === next.ck.id, today)).join('')}</ol>
            </section>`).join('')}
        </div>
        <p class="fineprint">默认日程按《孕前和孕期保健指南》的常规安排生成，各医院会有差异；约好日期后点「填日期」改成医院给的日子，提醒会跟着走。</p>
      </article>`;
  }

  function viewRemindStrip() {
    const perm = notifyPermission();
    let control = '';
    if (perm === 'granted') control = `<span class="pill pill-on">${A.icon.bell}网页通知已开启</span>`;
    if (perm === 'default') control = `<button type="button" class="pill pill-btn" data-action="enable-notify">${A.icon.bell}开启网页通知</button>`;
    return `
      <div class="remind-strip">
        <p>${A.icon.bell}<span>到日子会在页面顶部提醒${perm === 'granted' ? '，页面开着时还会弹系统通知' : ''}。关着页面也想准时收到？点「导入日历」，系统日历会在<b>前一晚 8 点</b>和<b>当天</b>提醒你。</span></p>
        ${control}
      </div>`;
  }

  function viewCheckupRow({ ck, status }, isNext, today) {
    const id = esc(ck.id);
    const k = status.kind;
    const showWindow = ck.start != null && ck.end != null && Math.floor(ck.start / 7) !== Math.floor(ck.end / 7);
    const showPrep = ck.prep && (isNext || k === 'today' || (k === 'upcoming' && status.diff === 1));
    const rel = {
      done: '已完成',
      today: '就是今天',
      upcoming: D.formatRelative(status.diff),
      open: status.daysLeft ? `窗口期还剩 ${status.daysLeft} 天` : '窗口期最后一天',
      past: '已过，没标完成',
    }[k];

    const tags = [];
    if (isNext) tags.push('<span class="tag tag-next">下一次</span>');
    if (k !== 'done') tags.push(status.booked ? '<span class="tag tag-booked">已预约</span>' : '<span class="tag">建议日期</span>');

    const actions = [
      `<button type="button" class="chip" data-action="toggle-done" data-id="${id}">${k === 'done' ? '撤销完成' : `${A.icon.check}完成`}</button>`,
      `<button type="button" class="chip" data-action="edit-checkup" data-id="${id}">${status.booked || k === 'done' ? '编辑' : '填日期'}</button>`,
    ];
    if (k === 'today' || k === 'upcoming') {
      actions.push(`<button type="button" class="chip chip-icon" data-action="export-ics-one" data-id="${id}" title="加到日历" aria-label="把「${esc(ck.title)}」加到日历">${A.icon.calendarPlus}</button>`);
    }

    return `
      <li class="ck ck-${k}${isNext ? ' ck-next' : ''}">
        <span class="ck-dot">${k === 'done' ? A.icon.check : ''}</span>
        <div class="ck-week"><b>${Math.max(0, Math.floor(status.ga / 7))}</b>周</div>
        <div class="ck-main">
          <div class="ck-top">
            <h4 class="ck-title">${esc(ck.title)}</h4>
            ${tags.join('')}
          </div>
          ${showWindow && k !== 'done' ? `<p class="ck-window">建议在 ${D.formatWindow(ck.start, ck.end)}内做</p>` : ''}
          ${ck.items.length ? `<p class="ck-items">${ck.items.map(esc).join('<i>·</i>')}</p>` : ''}
          ${ck.tip ? `<p class="ck-tip">${esc(ck.tip)}</p>` : ''}
          ${showPrep ? `<p class="ck-prep">${A.icon.bag}<span>${esc(ck.prep)}</span></p>` : ''}
        </div>
        <div class="ck-side">
          <p class="ck-date">${D.formatDate(status.date, { weekday: true, relativeTo: today })}${ck.time ? `<span class="ck-time">${ck.time}</span>` : ''}</p>
          <p class="ck-rel">${rel}</p>
          <div class="ck-actions">${actions.join('')}</div>
        </div>
      </li>`;
  }

  function viewBag(ga) {
    const sum = M.bagSummary(state);
    let meta = '清单空了，在下面加几样吧';
    if (sum.total) meta = `已备好 ${sum.done}/${sum.total}${sum.left ? ` · ${bagTiming(ga)}` : ''}`;
    const pct = sum.total ? (sum.done / sum.total) * 100 : 0;
    return `
      <article class="card card-bag" id="bag">
        <header class="card-head">
          <div>
            <h2 class="card-title">${A.icon.suitcase}待产包</h2>
            <p class="card-meta">${meta}</p>
          </div>
        </header>
        ${sum.total ? `
          <div class="bag-progress${sum.left ? '' : ' is-full'}" role="progressbar" aria-label="待产包准备进度" aria-valuemin="0" aria-valuemax="${sum.total}" aria-valuenow="${sum.done}">
            <i style="width:${pct.toFixed(1)}%"></i>
          </div>` : ''}
        ${sum.total && !sum.left ? `<p class="bag-ready"><span class="bag-ready-bee">${A.bee}</span>都备齐啦！放在门口，到时候拎起就走。</p>` : ''}
        <div class="bag-groups">${M.bagGroups(state).map(viewBagGroup).join('')}</div>
        <p class="fineprint">这是常见的准备清单，很多医院会给自己的要求或提供部分用品，以医院为准。用不上的点 × 删掉，缺的点「加一样」。</p>
      </article>`;
  }

  function viewBagGroup(g) {
    const add = ui.bagAdding === g.id
      ? `
        <form class="bag-add-form" data-form="bag-item" data-group="${g.id}" novalidate>
          <input id="bag-new" name="name" maxlength="${M.BAG_NAME_MAX}" autocomplete="off" placeholder="比如 ${esc(g.example)}" aria-label="往「${esc(g.name)}」里加一样" data-keep>
          <button class="btn btn-sm">加上</button>
          <button type="button" class="icon-btn icon-btn-sm" data-action="cancel-bag-item" aria-label="不加了" title="不加了">${A.icon.x}</button>
        </form>`
      : `<button type="button" class="bag-add" id="bag-add-${g.id}" data-action="add-bag-item" data-group="${g.id}">${A.icon.plus}加一样</button>`;
    return `
      <section class="bag-group">
        <h3 class="bag-group-title">${esc(g.name)}${g.items.length ? `<small>${g.done}/${g.items.length}</small>` : ''}</h3>
        ${g.items.length ? `<ul class="bag-list">${g.items.map(viewBagItem).join('')}</ul>` : ''}
        ${add}
      </section>`;
  }

  function viewBagItem(b) {
    const id = esc(b.id);
    return `
      <li class="bag-item${b.done ? ' is-done' : ''}">
        <label class="bag-check">
          <input type="checkbox" id="bag-item-${id}" data-action="toggle-bag-item" data-id="${id}"${b.done ? ' checked' : ''}>
          <span class="bag-box" aria-hidden="true">${A.icon.check}</span>
          <span class="bag-text"><span class="bag-name">${esc(b.name)}</span>${b.note ? `<span class="bag-note">${esc(b.note)}</span>` : ''}</span>
        </label>
        <button type="button" class="icon-btn icon-btn-sm" data-action="delete-bag-item" data-id="${id}" aria-label="删掉「${esc(b.name)}」" title="删掉">${A.icon.x}</button>
      </li>`;
  }

  function viewOnboarding() {
    return `
      <main class="onboard">
        <div class="onboard-card">
          <div class="onboard-art">${A.scene}</div>
          <h1 class="onboard-title">欢迎来到孕期工作台</h1>
          <p class="onboard-lead">先告诉我预产期，其它的都可以以后慢慢填。</p>
          <form class="onboard-form" data-form="onboard" novalidate>
            ${profileFields({})}
            <p class="form-error" hidden></p>
            <button class="btn btn-lg">开始记录</button>
          </form>
          <p class="fineprint">所有记录只保存在这台设备的浏览器里，不会上传到任何地方。</p>
        </div>
      </main>`;
  }

  function profileFields(p) {
    return `
      <label class="field">
        <span>预产期</span>
        <input type="date" name="dueDate" value="${p.dueDate || ''}">
      </label>
      <details class="lmp">
        <summary>不知道预产期？用末次月经推算</summary>
        <div class="lmp-row">
          <input type="date" name="lmp" max="${ui.today}" aria-label="末次月经第一天">
          <button type="button" class="btn btn-ghost btn-sm" data-action="apply-lmp">推算</button>
        </div>
        <p class="hint lmp-hint">末次月经第一天往后数 280 天。医院按 B 超校正过的话，以医院给的为准。</p>
      </details>
      <div class="field-row">
        <label class="field">
          <span>孕前体重 <small>可选，kg</small></span>
          <input name="preWeight" inputmode="decimal" autocomplete="off" placeholder="例如 52.5" value="${p.preWeight != null ? kg(p.preWeight) : ''}">
        </label>
        <label class="field">
          <span>宝宝小名 <small>可选</small></span>
          <input name="nickname" maxlength="12" autocomplete="off" placeholder="例如 豆豆" value="${esc(p.nickname || '')}">
        </label>
      </div>`;
  }

  function drawChart() {
    const box = document.getElementById('weight-chart');
    if (!box || !state) return;
    const width = Math.max(260, Math.round(box.clientWidth));
    box.innerHTML = Chart.weight({
      weights: state.weights,
      dueDate: state.profile.dueDate,
      preWeight: state.profile.preWeight,
      today: ui.today,
      width,
      height: width < 420 ? 200 : 260,
    });
  }

  // ---------- 弹窗 ----------

  function openSettings() {
    settingsDialog.innerHTML = `
      <form class="dialog-body" data-form="settings" novalidate>
        <header class="dialog-head">
          <h2>设置</h2>
          <button type="button" class="icon-btn" data-action="close-dialog" aria-label="关闭">${A.icon.x}</button>
        </header>
        ${profileFields(state.profile)}
        <p class="form-error" hidden></p>
        <div class="dialog-actions">
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost" data-action="close-dialog">取消</button>
          <button class="btn">保存</button>
        </div>
        <section class="settings-data">
          <h3>数据</h3>
          <p class="hint">记录只存在这台设备的这个浏览器里。换浏览器、清理浏览器数据之前，先导出一份备份。</p>
          <div class="btn-row">
            <button type="button" class="btn btn-ghost btn-sm" data-action="export-backup">${A.icon.download}导出备份</button>
            <button type="button" class="btn btn-ghost btn-sm" data-action="import-backup">导入备份</button>
            <button type="button" class="btn btn-ghost btn-sm" data-action="reset-checkups">恢复默认产检日程</button>
            <button type="button" class="btn btn-ghost btn-sm" data-action="reset-bag">恢复默认待产包</button>
            <button type="button" class="btn btn-quiet btn-sm" data-action="clear-all">清空全部数据</button>
          </div>
        </section>
      </form>`;
    settingsDialog.showModal();
  }

  function openCheckupDialog(id) {
    const ck = id ? state.checkups.find((c) => c.id === id) : null;
    if (id && !ck) return;
    const due = state.profile.dueDate;
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
    checkupDialog.showModal();
  }

  function formError(form, message) {
    const el = form.querySelector('.form-error');
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
  }

  // ---------- 提示条 ----------

  let toastTimer = 0;
  function toast(message, undo) {
    ui.undo = undo || null;
    toastBox.innerHTML = `
      <div class="toast" role="status">
        <span>${esc(message)}</span>
        ${undo ? '<button type="button" class="toast-btn" data-action="undo">撤销</button>' : ''}
      </div>`;
    toastBox.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastBox.classList.remove('show');
      ui.undo = null;
    }, undo ? 6000 : 3200);
  }

  // ---------- 动作 ----------

  function persist() {
    if (!S.save(state)) toast('没保存成功：浏览器存储可能满了或被禁用了');
  }

  function download(text, filename, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.replace(/[\\/:*?"<>|]+/g, '-');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadCalendar(rows, filename) {
    const events = rows.map((r) => Cal.checkupEvent(r.ck, r.status));
    download(Cal.build(events, new Date()), filename, 'text/calendar;charset=utf-8');
  }

  function readProfile(form) {
    const f = new FormData(form);
    const dueDate = String(f.get('dueDate') || '');
    const error = M.dueDateError(dueDate, ui.today);
    if (error) return { error };
    const preRaw = String(f.get('preWeight') || '').trim();
    const preWeight = preRaw ? M.parseKg(preRaw) : null;
    if (preRaw && preWeight == null) return { error: '孕前体重填个数字就好，例如 52.5' };
    return { profile: { dueDate, preWeight, nickname: String(f.get('nickname') || '').trim().slice(0, 12) } };
  }

  function saveWeight(date, raw, inputsToClear) {
    const value = M.parseKg(raw);
    if (value == null) {
      toast(String(raw).trim() ? '体重填个数字就好，例如 56.2' : '先填一下体重');
      return;
    }
    if (!D.isISODate(date) || date > ui.today) {
      toast('日期不能晚于今天');
      return;
    }
    const ref = M.weightSummary(state, ui.today).latest;
    if (ref && Math.abs(value - ref.kg) > 10 &&
        !window.confirm(`和上次（${kg(ref.kg)} kg）差了 ${kg(Math.abs(value - ref.kg))} kg，确定没填错吗？`)) {
      return;
    }
    const before = state.weights.find((w) => w.date === date) || null;
    M.upsertWeight(state, date, value);
    persist();
    ui.clearInputs.push(...inputsToClear);
    render();
    const label = date === ui.today ? '今天' : D.formatDate(date);
    toast(`${label} ${kg(value)} kg 记好啦`, () => {
      if (before) M.upsertWeight(state, date, before.kg);
      else M.removeWeight(state, date);
    });
  }

  function checkNotifications() {
    if (!state || notifyPermission() !== 'granted') return;
    const list = M.pendingNotifications(state, ui.today, new Date().getHours());
    if (!list.length) return;
    for (const n of list) {
      try {
        new Notification(n.title, { body: n.body, tag: n.key, icon: 'favicon.svg' });
      } catch (e) {
        // 安卓 Chrome 只允许 Service Worker 发通知，这里静默跳过，页面横幅照常显示
      }
    }
    M.markNotified(state, list.map((n) => n.key), ui.today);
    persist();
  }

  const forms = {
    onboard(form) {
      const { profile, error } = readProfile(form);
      if (error) return formError(form, error);
      state = M.createState(profile);
      persist();
      render();
      toast('准备好啦，从今天开始慢慢记');
      checkNotifications();
    },

    settings(form) {
      const { profile, error } = readProfile(form);
      if (error) return formError(form, error);
      const dueChanged = profile.dueDate !== state.profile.dueDate;
      state.profile = profile;
      persist();
      settingsDialog.close();
      render();
      toast(dueChanged ? '预产期更新了，建议日期也跟着调整好了' : '保存好了');
    },

    'quick-weight'(form) {
      saveWeight(ui.today, form.elements.kg.value, ['quick-kg']);
    },

    'add-weight'(form) {
      saveWeight(form.elements.date.value || ui.today, form.elements.kg.value, ['w-kg', 'w-date']);
    },

    checkup(form) {
      const f = new FormData(form);
      const id = form.dataset.id;
      const ck = id ? state.checkups.find((c) => c.id === id) : null;
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
      if (ck) M.updateCheckup(state, id, fields);
      else M.addCheckup(state, fields);
      persist();
      checkupDialog.close();
      render();
      toast(ck ? '保存好了' : '加好了，已经按孕周排进日程');
    },

    'bag-item'(form) {
      const name = form.elements.name.value.trim().slice(0, M.BAG_NAME_MAX);
      const error = M.bagItemError(state, name);
      if (error) {
        toast(error);
        form.elements.name.focus();
        return;
      }
      M.addBagItem(state, form.dataset.group, name);
      persist();
      ui.clearInputs.push('bag-new');
      render();
      document.getElementById('bag-new')?.focus();
    },
  };

  const actions = {
    'open-settings': openSettings,

    'close-dialog'(el) {
      el.closest('dialog')?.close();
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
      const removed = M.removeWeight(state, el.dataset.date);
      if (!removed) return;
      persist();
      render();
      toast(`删掉了 ${D.formatDate(removed.date)} 的记录`, () => M.upsertWeight(state, removed.date, removed.kg));
    },

    'toggle-done'(el) {
      const ck = state.checkups.find((c) => c.id === el.dataset.id);
      if (!ck) return;
      ck.done = !ck.done;
      persist();
      render();
      toast(ck.done ? `「${ck.title}」完成啦，辛苦了` : `「${ck.title}」改回没完成`, () => { ck.done = !ck.done; });
    },

    'mark-past-done'() {
      const rows = M.scheduleRows(state, ui.today).filter((r) => r.status.kind === 'past');
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
      const removed = M.removeCheckup(state, el.dataset.id);
      if (!removed) return;
      persist();
      checkupDialog.close();
      render();
      toast(`删掉了「${removed.ck.title}」`, () => state.checkups.splice(removed.index, 0, removed.ck));
    },

    'toggle-bag-item'(el) {
      const item = M.toggleBagItem(state, el.dataset.id);
      if (!item) return;
      persist();
      render();
      if (item.done && !M.bagSummary(state).left) toast('最后一样也备好了，辛苦啦');
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
      const removed = M.removeBagItem(state, el.dataset.id);
      if (!removed) return;
      persist();
      render();
      toast(`删掉了「${removed.item.name}」`, () => state.bag.splice(removed.index, 0, removed.item));
    },

    'scroll-to-bag'() {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.getElementById('bag')?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    },

    'export-ics'() {
      const rows = M.scheduleRows(state, ui.today).filter((r) => !r.ck.done && r.status.diff >= 0);
      if (!rows.length) return toast('没有需要提醒的产检了');
      downloadCalendar(rows, '产检日程.ics');
      toast(`导出了 ${rows.length} 次产检，打开下载的文件就能加进日历`);
    },

    'export-ics-one'(el) {
      const row = M.scheduleRows(state, ui.today).find((r) => r.ck.id === el.dataset.id);
      if (!row || row.status.diff < 0) return toast('先填好日期，再加到日历');
      downloadCalendar([row], `产检-${row.ck.title}.ics`);
      toast('打开下载的文件就能加进日历');
    },

    async 'enable-notify'() {
      if (notifyPermission() === 'unsupported') return toast('这个浏览器不支持网页通知，用「导入日历」更稳');
      const result = await Notification.requestPermission();
      render();
      if (result === 'granted') {
        toast('好啦，页面开着时到日子会弹通知');
        checkNotifications();
      } else {
        toast('通知没打开，可以在浏览器的网站设置里允许，或者用「导入日历」');
      }
    },

    'export-backup'() {
      download(S.backupText(state, new Date()), `孕期工作台备份-${ui.today}.json`, 'application/json');
      formError(settingsDialog.querySelector('form'), '');
      settingsDialog.querySelector('.settings-data .hint').textContent = '备份已经下载好了，放在安全的地方。';
    },

    'import-backup'() {
      const form = settingsDialog.querySelector('form');
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;
        try {
          const next = S.parseBackup(await file.text());
          if (!window.confirm('导入会覆盖现在的全部记录，确定吗？')) return;
          state = next;
          persist();
          settingsDialog.close();
          render();
          toast('备份导入好了');
        } catch (e) {
          formError(form, e.message);
        }
      });
      input.click();
    },

    'reset-checkups'() {
      if (!window.confirm('恢复默认产检日程会清掉你改过的日期和完成状态（自己添加的会保留），确定吗？')) return;
      const before = state.checkups;
      M.resetCheckups(state);
      persist();
      settingsDialog.close();
      render();
      toast('产检日程恢复成默认了', () => { state.checkups = before; });
    },

    'reset-bag'() {
      if (!window.confirm('恢复默认待产包会清掉默认物品的勾选、找回删掉的（自己添加的不受影响），确定吗？')) return;
      const before = state.bag;
      M.resetBag(state);
      persist();
      settingsDialog.close();
      render();
      toast('待产包恢复成默认清单了', () => { state.bag = before; });
    },

    'clear-all'() {
      if (!window.confirm('确定清空全部数据吗？清空后找不回来，建议先导出备份。')) return;
      S.clear();
      state = null;
      ui.bagAdding = null;
      settingsDialog.close();
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

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || !actions[el.dataset.action]) return;
    e.preventDefault();
    actions[el.dataset.action](el);
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

  for (const dialog of [settingsDialog, checkupDialog]) {
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
  }

  function tick() {
    const today = D.today();
    if (today !== ui.today) {
      ui.today = today;
      render();
    }
    checkNotifications();
  }

  setInterval(tick, 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tick();
  });

  window.addEventListener('storage', (e) => {
    if (e.key !== S.KEY) return;
    state = S.load();
    render();
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawChart, 120);
  });

  render();
  checkNotifications();
})();
