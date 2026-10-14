(function () {
  'use strict';
  const { dates: D, content: C, model: M, storage: S, calendar: Cal, chart: Chart, art: A } = globalThis.Baby;

  const root = document.getElementById('app');
  const toastBox = document.getElementById('toast');
  const settingsDialog = document.getElementById('settings-dialog');
  const checkupDialog = document.getElementById('checkup-dialog');
  const medDialog = document.getElementById('med-dialog');
  const sheetDialog = document.getElementById('sheet-dialog');
  const DIALOGS = [settingsDialog, checkupDialog, medDialog, sheetDialog];

  // 页面都用地址栏的 # 区分，手机上的返回键就能退回上一页
  const SECTIONS = {
    today: { name: '今天', subs: [''] },
    records: { name: '记录', subs: ['weight', 'bp', 'glucose', 'meds'] },
    checkups: { name: '产检', subs: ['schedule', 'ultrasound'] },
    tools: { name: '工具', subs: ['', 'kicks', 'contractions', 'food', 'bag', 'weeks'] },
  };
  const SUB_NAMES = {
    weight: '体重',
    bp: '血压',
    glucose: '血糖',
    meds: '用药',
    schedule: '产检日程',
    ultrasound: 'B 超单',
    kicks: '数胎动',
    contractions: '宫缩计时',
    food: '能不能吃',
    bag: '待产包',
    weeks: '每周变化',
  };

  const WEIGHTS_SHOWN = 6;
  // 首屏从 32 周起提醒收拾待产包，最好 36 周前备齐
  const BAG_REMIND_FROM = 32 * 7;
  const BAG_READY_BY = 36 * 7;
  // 28 周起每天提醒数胎动；不满 37 周的规律宫缩按早产处理
  const KICKS_FROM = 28 * 7;
  const TERM_FROM = 37 * 7;
  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
  const kg = M.formatKg;
  const kgDiff = M.formatKgDiff;
  const clamp01 = (n) => Math.min(Math.max(n, 0), 1);
  const pad2 = (n) => String(n).padStart(2, '0');
  const hhmm = (t) => `${pad2(new Date(t).getHours())}:${pad2(new Date(t).getMinutes())}`;
  const notifyPermission = () => ('Notification' in window ? Notification.permission : 'unsupported');

  let state = S.load();
  const ui = {
    today: D.today(),
    showAllWeights: false,
    bagAdding: null,
    medStage: 'all',
    kickFeedback: '',
    focusNext: '',
    foodQuery: '',
    foodLevel: 'all',
    glucoseSlot: '',
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
    const focusId = ui.focusNext || (root.contains(document.activeElement) ? document.activeElement.id : '');
    ui.focusNext = '';

    root.innerHTML = state ? viewApp() : viewOnboarding();

    for (const [id, value] of Object.entries(kept)) {
      const el = document.getElementById(id);
      if (el) el.value = value;
    }
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
    drawCharts();
    paintClocks(Date.now());

    if (state) {
      const ga = D.gestation(state.profile.dueDate, ui.today);
      document.title = `孕 ${ga.weeks} 周${ga.day ? ` + ${ga.day} 天` : ''} · 孕期工作台`;
    } else {
      document.title = '孕期工作台';
    }
  }

  function currentRoute() {
    const [section, sub = ''] = location.hash.replace(/^#\/?/, '').split('/');
    const id = SECTIONS[section] ? section : 'today';
    const subs = SECTIONS[id].subs;
    return { section: id, sub: subs.includes(sub) ? sub : subs[0] };
  }

  /** 换页；已经在这一页就直接重绘 */
  function go(hash, focusId = '') {
    ui.focusNext = focusId;
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function viewApp() {
    const route = currentRoute();
    const ctx = { today: ui.today, now: Date.now(), ga: D.gestation(state.profile.dueDate, ui.today) };
    const pages = { today: viewTodayPage, records: viewRecordsPage, checkups: viewCheckupsPage, tools: viewToolsPage };
    return `
      ${viewHeader(route)}
      ${viewTabbar(route)}
      ${viewLive(route, ctx.now)}
      <main class="page page-${route.section}${route.sub ? ` page-${route.sub}` : ''}">
        ${pages[route.section](route, ctx)}
      </main>`;
  }

  function viewHeader(route) {
    const today = ui.today;
    return `
      <header class="topbar">
        <a class="brand" href="#/">
          <span class="brand-mark">${A.honeyPot}</span>
          <span class="brand-text">
            <span class="brand-title">孕期工作台</span>
            <span class="brand-sub">慢慢来，一切都刚刚好</span>
          </span>
        </a>
        <div class="topbar-side">
          <p class="topbar-date"><span class="topbar-greet">${greeting(new Date().getHours())}</span>${D.formatDate(today)} 星期${D.weekday(today)}</p>
          <button type="button" class="icon-btn" data-action="open-settings" aria-label="设置" title="设置">${A.icon.sliders}</button>
        </div>
      </header>`;
  }

  /** 手机上固定在底部、电脑上在顶部的主菜单 */
  function viewTabbar(route) {
    const icons = { today: A.icon.home, records: A.icon.notes, checkups: A.icon.calendarHeart, tools: A.icon.grid };
    const dot = M.reminders(M.scheduleRows(state, ui.today)).length ? 'checkups' : '';
    return `
      <nav class="tabbar" aria-label="主菜单">
        ${Object.entries(SECTIONS).map(([id, s]) => `
          <a href="#/${id === 'today' ? '' : id}" class="tab"${route.section === id ? ' aria-current="page"' : ''}>
            <span class="tab-icon">${icons[id]}${dot === id ? '<i class="tab-dot" aria-label="有提醒"></i>' : ''}</span>
            <span class="tab-name">${s.name}</span>
          </a>`).join('')}
      </nav>`;
  }

  /** 正在数胎动、正在计宫缩时，换到别的页面也挂一条提示，点一下回去 */
  function viewLive(route, now) {
    if (route.section === 'tools' && !route.sub) return '';
    const items = [];
    const kicks = M.activeKicks(state, now);
    if (kicks && route.sub !== 'kicks') {
      items.push(`<a class="live" href="#/tools/kicks">${A.icon.feet}<span>正在数胎动 · 还剩 <b data-until="${kicks.start + M.KICK_WINDOW}"></b> · ${M.countedKicks(kicks.taps).length} 次</span>${A.icon.chevronRight}</a>`);
    }
    const contraction = M.activeContraction(state);
    if (contraction && route.sub !== 'contractions') {
      items.push(`<a class="live live-alert" href="#/tools/contractions">${A.icon.timer}<span>宫缩计时中 · <b data-since="${contraction.start}"></b></span>${A.icon.chevronRight}</a>`);
    }
    return items.length ? `<div class="live-bar">${items.join('')}</div>` : '';
  }

  function segTabs(section, current) {
    return `
      <nav class="seg-tabs" aria-label="${SECTIONS[section].name}">
        ${SECTIONS[section].subs.map((s) => `<a href="#/${section}/${s}" class="seg-tab"${s === current ? ' aria-current="page"' : ''}>${SUB_NAMES[s]}</a>`).join('')}
      </nav>`;
  }

  function viewTodayPage(route, { today, now, ga }) {
    const rows = M.scheduleRows(state, today);
    return `
      ${viewBanner(M.reminders(rows))}
      <section class="hero">
        ${viewWeek(ga, state.profile.dueDate, today)}
        ${viewBaby(ga)}
        ${viewToday(ga, rows, today, now)}
      </section>
      ${viewMom(ga)}
      <footer class="foot">
        <span class="foot-bee">${A.bee}</span>
        <p>记录只保存在这台设备的浏览器里，偶尔在设置里导出一份备份更安心。</p>
        <p>宝宝大小是平均参考，每个宝宝都有自己的节奏；产检安排以医院和医生为准。</p>
      </footer>`;
  }

  function viewRecordsPage(route, { today, ga }) {
    const views = {
      weight: () => viewWeights(today),
      bp: () => viewBp(today),
      glucose: () => viewGlucose(today),
      meds: () => viewMeds(today, ga),
    };
    return `${segTabs('records', route.sub)}${views[route.sub]()}`;
  }

  function viewCheckupsPage(route, { today }) {
    const body = route.sub === 'ultrasound' ? viewUltrasounds(today) : viewCheckups(M.scheduleRows(state, today), today);
    return `${segTabs('checkups', route.sub)}${body}`;
  }

  function viewToolsPage(route, { now, ga }) {
    if (!route.sub) return viewToolMenu(ga, now);
    const views = {
      kicks: () => viewKicksTool(now),
      contractions: () => viewContractionsTool(now),
      food: () => viewFoodTool(),
      bag: () => viewBag(ga),
      weeks: () => viewWeeks(ga),
    };
    return `
      <header class="page-head">
        <a href="#/tools" class="back">${A.icon.chevronLeft}<span>工具</span></a>
        <h1 class="page-title">${SUB_NAMES[route.sub]}</h1>
      </header>
      ${views[route.sub]()}`;
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

  function viewToday(ga, rows, today, now) {
    return `
      <article class="panel panel-today">
        <p class="eyebrow">今天该记</p>
        <ul class="todo">
          ${todoWeight(M.weightSummary(state, today))}
          ${todoKicks(ga, now)}
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
          <p class="todo-text">${bagTiming(ga)} · <a class="link" href="#/tools/bag">去打勾</a></p>
        </div>
      </li>`;
  }

  function bagTiming(ga) {
    if (ga.days < BAG_REMIND_FROM) return '一般 32 周起慢慢收拾，36 周前备齐';
    if (ga.days < BAG_READY_BY) return `最好 36 周前备齐，还有 ${BAG_READY_BY - ga.days} 天`;
    return '快足月了，尽快备齐，证件放在最上面';
  }

  function todoKicks(ga, now) {
    if (ga.days < KICKS_FROM) return '';
    const active = M.activeKicks(state, now);
    if (active) {
      return `
        <li class="todo-item">
          <span class="todo-icon">${A.icon.feet}</span>
          <div class="todo-body">
            <p class="todo-title">正在数胎动</p>
            <p class="todo-text">还剩 <b class="todo-clock" data-until="${active.start + M.KICK_WINDOW}"></b> · 已经 ${M.countedKicks(active.taps).length} 次 · <a class="link" href="#/tools/kicks">接着数</a></p>
          </div>
        </li>`;
    }
    const latest = todayKicks(now)[0];
    if (latest) {
      const warn = latest.verdict === 'low' || latest.verdict === 'drop';
      return `
        <li class="todo-item${warn ? '' : ' is-done'}">
          <span class="todo-icon${warn ? ' todo-icon-alert' : ''}">${warn ? A.icon.alert : A.icon.check}</span>
          <div class="todo-body">
            <p class="todo-title">${warn ? '今天胎动偏少，留意一下' : '今天数过胎动了'}</p>
            <p class="todo-text">最近一次 ${kickResult(latest)} · <a class="link" href="#/tools/kicks">${warn ? '看看怎么办' : '再数一次'}</a></p>
          </div>
        </li>`;
    }
    return `
      <li class="todo-item">
        <span class="todo-icon">${A.icon.feet}</span>
        <div class="todo-body">
          <p class="todo-title">数胎动</p>
          <p class="todo-text">每天找个固定时间数 1 小时，3 次以上算正常</p>
          <div class="todo-actions"><button type="button" class="btn btn-ghost btn-sm" data-action="start-kicks">开始数</button></div>
        </div>
      </li>`;
  }

  /** 今天（按真实时钟）数完的几次，新的在前 */
  function todayKicks(now) {
    const day = D.localISO(new Date(now));
    return M.kickReview(state, now).filter((r) => !r.running && r.date === day);
  }

  const kickResult = (r) => (r.full ? `1 小时 ${r.count} 次` : `${r.minutes} 分钟 ${r.count} 次`);

  // ---------- 小工具 ----------

  function viewToolMenu(ga, now) {
    const tile = (id, icon, { text, live = false }) => `
      <a class="tool${live ? ' is-live' : ''}" href="#/tools/${id}" data-tool="${id}">
        <span class="tool-icon">${icon}</span>
        <span class="tool-text"><span class="tool-name">${SUB_NAMES[id]}</span><span class="tool-status">${text}</span></span>
        <span class="tool-go">${A.icon.chevronRight}</span>
      </a>`;
    const bag = M.bagSummary(state);
    return `
      <section class="tool-menu" aria-label="小工具">
        ${tile('kicks', A.icon.feet, kickStatus(ga, now))}
        ${tile('contractions', A.icon.timer, contractionStatus(ga, now))}
        ${tile('food', A.icon.bowl, { text: `${C.FOODS.length} 种常见食物，搜一下就知道` })}
        ${tile('bag', A.icon.suitcase, { text: bag.total ? `已备好 ${bag.done}/${bag.total}` : '清单空了，去加几样' })}
        ${tile('weeks', A.icon.book, { text: `现在是第 ${Math.max(ga.weeks, 0)} 周，看看宝宝和妈妈的变化` })}
      </section>`;
  }

  function kickStatus(ga, now) {
    const active = M.activeKicks(state, now);
    if (active) return { live: true, text: `正在数 · 还剩 <b data-until="${active.start + M.KICK_WINDOW}"></b> · ${M.countedKicks(active.taps).length} 次` };
    const today = todayKicks(now);
    if (today.length) return { text: `今天数了 ${today.length} 回 · 最近 ${kickResult(today[0])}` };
    return { text: ga.days < KICKS_FROM ? '28 周起每天数一数' : '今天还没数' };
  }

  function contractionStatus(ga, now) {
    const running = M.activeContraction(state);
    if (running) return { live: true, text: `宫缩中 · <b data-since="${running.start}"></b>` };
    const stats = M.contractionStats(state, now);
    if (stats.count >= 2) return { text: `最近 1 小时 ${stats.count} 次 · 约 ${stats.avgInterval} 分钟一次` };
    const last = M.contractionRows(state, now)[0];
    if (last) return { text: `上一次 ${whenText(last.contraction.start, now)}` };
    return { text: ga.days < TERM_FROM ? '快生的时候用，帮你算间隔' : '肚子一阵阵发紧时，点开计时' };
  }

  /** 今天 08:30 / 昨天 22:10 / 10月3日 09:00 */
  function whenText(t, now) {
    const day = D.localISO(new Date(t));
    const diff = D.diffDays(day, D.localISO(new Date(now)));
    const label = diff === 0 ? '今天' : diff === 1 ? '昨天' : D.formatDate(day);
    return `${label} ${hhmm(t)}`;
  }

  /** 45 秒 / 6 分 30 秒 / 5 分钟 / 1 小时 20 分 */
  function spanText(ms) {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s} 秒`;
    const m = Math.floor(s / 60);
    if (m >= 60) return `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
    return s % 60 ? `${m} 分 ${s % 60} 秒` : `${m} 分钟`;
  }

  function clockText(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
  }

  function toolCard(lead, body) {
    return `
      <article class="card tool-card">
        <p class="tool-lead">${lead}</p>
        ${body}
      </article>`;
  }

  function viewKicksTool(now) {
    const ga = D.gestation(state.profile.dueDate, ui.today);
    const rows = M.kickReview(state, now);
    const active = rows.find((r) => r.running);
    const past = rows.filter((r) => !r.running);
    let main;
    if (active) {
      const until = active.session.start + M.KICK_WINDOW;
      main = `
        <div class="kick-live">
          <p class="kick-clock">还剩<b data-until="${until}">${clockText(until - now)}</b></p>
          <button type="button" class="kick-btn" id="kick-tap" data-action="tap-kick">${A.icon.feet}<span>动了</span></button>
          <p class="kick-count"><b>${active.count}</b>次</p>
          <p class="kick-note">${esc(ui.kickFeedback || '感觉到胎动就点一下，5 分钟内连续的只算 1 次')}${active.taps ? ` · 一共点了 ${active.taps} 下` : ''}</p>
          <div class="kick-controls">
            <button type="button" class="btn btn-ghost btn-sm" data-action="end-kicks">提前结束</button>
            <button type="button" class="btn btn-quiet btn-sm" data-action="delete-kicks" data-id="${esc(active.session.id)}">这次不算</button>
          </div>
        </div>`;
    } else {
      const latest = past[0] && past[0].date === D.localISO(new Date(now)) ? past[0] : null;
      main = `
        <div class="kick-start">
          ${latest ? `<p class="kick-result kick-result-${latest.verdict}">${kickAdvice(latest)}</p>` : ''}
          <button type="button" class="btn btn-lg kick-go" id="kick-start" data-action="start-kicks">${A.icon.feet}开始数 1 小时</button>
          <ul class="kick-howto">
            <li>饭后、睡前宝宝比较活跃，每天尽量固定在同一个时间数。</li>
            <li>左侧躺或者坐着，手放在肚子上，专心感受。</li>
            <li>踢、扭、翻身都算；一下一下很规律的跳动多半是宝宝打嗝，不用算。</li>
            <li>1 小时 3 次以上算正常；少于 3 次，或者比平时少了一半以上，尽快去医院。</li>
          </ul>
        </div>`;
    }
    const history = past.slice(0, 20).map((r) => `
      <li class="kick-row is-${r.verdict}">
        <span class="kick-when">${whenText(r.session.start, now)}</span>
        <span class="kick-num"><b>${r.count}</b>次</span>
        <span class="kick-len">${r.full ? '1 小时' : `${r.minutes} 分钟`}</span>
        <button type="button" class="icon-btn icon-btn-sm" data-action="delete-kicks" data-id="${esc(r.session.id)}" aria-label="删除这次记录" title="删除">${A.icon.x}</button>
      </li>`).join('');
    return toolCard(
      ga.days < KICKS_FROM ? '一般从 28 周开始每天数，现在可以先熟悉一下' : '每天固定时间数 1 小时，摸清宝宝的规律',
      `${main}
        ${history ? `<section class="tool-section"><h3>最近的记录</h3><ul class="kick-list">${history}</ul></section>` : ''}`,
    );
  }

  function kickAdvice(r) {
    if (r.verdict === 'ok') return `${kickResult(r)}，在正常范围内（1 小时 3 次以上）。`;
    if (r.verdict === 'low') return `${kickResult(r)}，少于 3 次。先吃点东西、左侧躺下再数 1 小时；还是少于 3 次，尽快去医院。`;
    if (r.verdict === 'drop') return `${kickResult(r)}，比你最近平均的 ${r.baseline} 次少了一半多。胎动明显减少要尽快去医院检查。`;
    return `数了 ${r.minutes} 分钟，${r.count} 次。数满 1 小时更准。`;
  }

  function viewContractionsTool(now) {
    const ga = D.gestation(state.profile.dueDate, ui.today);
    const running = M.activeContraction(state);
    const stats = M.contractionStats(state, now);
    const rows = M.contractionRows(state, now).slice(0, 30);
    let advice = {
      go: '已经接近 5-1-1：约 5 分钟一次、每次约 1 分钟、持续快 1 小时了。第一胎可以准备去医院了；生过宝宝或者离医院远的，现在就出发。',
      watch: `宫缩比较规律了，平均 ${stats.avgInterval} 分钟一次。拎好待产包、继续计时，接近 5 分钟一次就出发。`,
      early: '间隔还不规律，可能是假性宫缩。休息一下、喝点水、换个姿势，看看会不会缓解。',
    }[stats.level];
    let level = stats.level;
    if (ga.days < TERM_FROM && (level === 'go' || level === 'watch')) {
      level = 'go';
      advice = '还没满 37 周就有规律宫缩，别等，马上联系医院或者去医院。';
    }
    const table = rows.map((r) => {
      const c = r.contraction;
      return `
        <tr>
          <td>${whenText(c.start, now)}</td>
          <td>${r.duration == null ? '进行中' : spanText(r.duration)}</td>
          <td>${r.interval == null || r.interval > 2 * 3600000 ? '—' : spanText(r.interval)}</td>
          <td><button type="button" class="icon-btn icon-btn-sm" data-action="delete-contraction" data-id="${esc(c.id)}" aria-label="删除这条" title="删除">${A.icon.x}</button></td>
        </tr>`;
    }).join('');
    return toolCard('肚子开始发紧时点一下，放松下来再点一下', `
        <button type="button" class="ctx-btn${running ? ' is-on' : ''}" id="ctx-btn" data-action="toggle-contraction">
          <span class="ctx-btn-label">${running ? '宫缩结束' : '宫缩开始'}</span>
          <span class="ctx-btn-time">${running ? `<b data-since="${running.start}">${clockText(now - running.start)}</b>` : '自动算出每次持续多久、隔了多久'}</span>
        </button>
        ${running && now - running.start > M.CONTRACTION_LONG ? `<p class="ctx-long">这次已经超过 5 分钟了，是不是忘了点结束？<button type="button" class="link" data-action="delete-contraction" data-id="${esc(running.id)}">这次不算</button></p>` : ''}
        ${advice ? `
          <div class="ctx-stats">
            <div><b>${stats.count}</b><span>最近 1 小时（次）</span></div>
            <div><b>${stats.avgInterval}</b><span>平均间隔（分钟）</span></div>
            <div><b>${stats.avgDuration}</b><span>平均持续（秒）</span></div>
          </div>
          <p class="ctx-advice ctx-${level}">${advice}</p>` : ''}
        ${table ? `
          <section class="tool-section">
            <h3>最近 12 小时</h3>
            <table class="ctx-table">
              <thead><tr><th>开始</th><th>持续</th><th>间隔</th><th><span class="sr-only">删除</span></th></tr></thead>
              <tbody>${table}</tbody>
            </table>
            <button type="button" class="btn btn-quiet btn-sm ctx-clear" data-action="clear-contractions">清空记录</button>
          </section>` : ''}
        <section class="go-now">
          <h3>${A.icon.alert}这些情况别等，直接去医院</h3>
          <ul>
            <li>破水了：不管有没有宫缩，尽量躺下、垫高屁股，马上去医院</li>
            <li>阴道出血，量像月经一样多或者更多</li>
            <li>胎动明显减少，或者感觉不到胎动</li>
            <li>持续剧烈腹痛，肚子一直发硬不放松</li>
            <li>头痛、眼花、看东西模糊，或者脸和手脚突然肿得厉害</li>
            <li>还没满 37 周就出现规律宫缩</li>
          </ul>
        </section>
        <p class="fineprint">5-1-1 是第一胎常用的参考。什么时候去医院，以你的医院和医生的交代为准。</p>`);
  }

  function viewFoodTool() {
    const chip = (id, label) =>
      `<button type="button" class="chip" id="food-level-${id}" data-action="food-level" data-level="${id}" aria-pressed="${ui.foodLevel === id}">${label}</button>`;
    return toolCard('孕期常被问到的食物，搜一下就知道', `
        <input type="search" id="food-q" class="food-search" placeholder="搜一搜，比如 螃蟹、咖啡" autocomplete="off" enterkeyhint="search" value="${esc(ui.foodQuery)}" aria-label="搜索食物">
        <div class="food-levels" role="group" aria-label="按级别筛选">${chip('all', '全部')}${C.FOOD_LEVELS.map((l) => chip(l.id, l.name)).join('')}</div>
        <div id="food-results" class="food-results">${viewFoodResults()}</div>
        <p class="fineprint">参考《中国居民膳食指南》孕期部分和常见的食品安全建议。有妊娠糖尿病、过敏或者医生特别交代的，听医生的。</p>`);
  }

  function viewFoodResults() {
    const list = C.searchFoods(ui.foodQuery, ui.foodLevel);
    if (!list.length) return `<p class="food-empty">没找到「${esc(ui.foodQuery.trim())}」，换个说法试试；拿不准的问问医生。</p>`;
    const levelName = Object.fromEntries(C.FOOD_LEVELS.map((l) => [l.id, l.name]));
    return C.FOOD_GROUPS.map((g) => {
      const items = list.filter((f) => f.group === g.id);
      if (!items.length) return '';
      return `
        <section class="food-group">
          <h3>${g.name}</h3>
          <ul class="food-list">${items.map((f) => `
            <li class="food food-${f.level}">
              <div class="food-top"><span class="food-name">${esc(f.name)}</span><span class="food-tag">${levelName[f.level]}</span></div>
              <p class="food-note">${esc(f.note)}</p>
            </li>`).join('')}
          </ul>
        </section>`;
    }).join('');
  }

  function paintClocks(now) {
    document.querySelectorAll('[data-until]').forEach((el) => { el.textContent = clockText(Number(el.dataset.until) - now); });
    document.querySelectorAll('[data-since]').forEach((el) => { el.textContent = clockText(now - Number(el.dataset.since)); });
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

  function viewMeds(today, ga) {
    const rows = M.medRows(state, today);
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
        <ul class="med-list">${shown.map(row).join('')}</ul>
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
    const sum = M.bpSummary(state, today);
    const list = state.bp.slice().reverse();
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
    const after = state.prefs.glucoseAfter;
    const sum = M.glucoseSummary(state, today);
    const days = M.glucoseDays(state);
    const values = new Map(days.map((d) => [d.date, d.values]));
    const dates = Array.from({ length: 7 }, (_, i) => D.addDays(today, -i));
    for (const d of days) if (d.date < dates[6]) dates.push(d.date);
    const slot = ui.glucoseSlot || guessSlot(new Date().getHours());

    let meta = '还没有记录';
    if (state.glucose.length) {
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

  // ---------- B 超 ----------

  const US_GROWTH = new Set(['crl', 'bpd', 'hc', 'ac', 'fl', 'efw']);
  const usText = (v) => String(Math.round(v * 10) / 10);

  function viewUltrasounds(today) {
    const rows = M.ultrasoundRows(state);
    const head = `
        <header class="card-head">
          <div>
            <h2 class="card-title">${A.icon.scan}B 超单</h2>
            <p class="card-meta">${rows.length ? `记了 ${rows.length} 次` : '还没有记录'}</p>
          </div>
          ${rows.length ? `<div class="card-actions"><button type="button" class="btn btn-ghost btn-sm" data-action="add-us">${A.icon.plus}添加</button></div>` : ''}
        </header>`;
    const glossary = `
        <details class="us-glossary">
          <summary>B 超单上的缩写是什么意思</summary>
          <dl>${C.US_FIELDS.map((f) => `<div><dt>${f.abbr} · ${f.name}</dt><dd>${esc(f.about)}</dd></div>`).join('')}</dl>
        </details>`;
    if (!rows.length) {
      return `
        <article class="card card-us">
          ${head}
          <div class="empty empty-compact">
            <span class="empty-art empty-icon">${A.icon.scan}</span>
            <p>每次 B 超的双顶径、股骨长、羊水这些数抄在这里，<br>会自动算出和上次比长了多少。</p>
            <button type="button" class="btn btn-ghost btn-sm" data-action="add-us">${A.icon.plus}记第一次</button>
          </div>
          ${glossary}
        </article>`;
    }
    const item = ({ record: r, ga, prev }) => {
      const cells = C.US_FIELDS.filter((f) => r.values[f.id] != null).map((f) => {
        const v = r.values[f.id];
        const flag = M.usFlag(f.id, v);
        const pv = prev ? prev.values[f.id] : null;
        const diff = US_GROWTH.has(f.id) && pv != null ? Math.round((v - pv) * 10) / 10 : null;
        return `
          <div class="us-item${flag ? ` is-${flag}` : ''}">
            <dt>${f.name}<small>${f.abbr}</small></dt>
            <dd><b>${usText(v)}</b><small>${f.unit}</small>${flag ? `<span class="us-flag">${flag === 'low' ? '偏低' : '偏高'}</span>` : ''}${diff ? `<span class="us-diff">比上次 ${diff > 0 ? '+' : ''}${usText(diff)}</span>` : ''}</dd>
          </div>`;
      }).join('');
      return `
        <li class="us">
          <div class="us-head">
            <p class="us-date">${D.formatDate(r.date, { relativeTo: today })}<small>${ga >= 0 ? `孕 ${D.formatGA(ga)} 周` : '孕前'}</small></p>
            <button type="button" class="chip" data-action="edit-us" data-id="${esc(r.id)}">编辑</button>
          </div>
          ${cells ? `<dl class="us-grid">${cells}</dl>` : ''}
          ${r.placenta ? `<p class="us-extra"><b>胎盘</b>${esc(r.placenta)}</p>` : ''}
          ${r.note ? `<p class="us-extra"><b>备注</b>${esc(r.note)}</p>` : ''}
        </li>`;
    };
    return `
      <article class="card card-us">
        ${head}
        <ul class="us-list">${rows.map(item).join('')}</ul>
        ${glossary}
        <p class="fineprint">每个宝宝、每台机器测出来都有差异，偏大偏小一点很常见；怎么看以医生的解读为准。</p>
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

  function drawCharts() {
    if (!state) return;
    const weightBox = document.getElementById('weight-chart');
    if (weightBox) {
      const width = Math.max(260, Math.round(weightBox.clientWidth));
      weightBox.innerHTML = Chart.weight({
        weights: state.weights,
        dueDate: state.profile.dueDate,
        preWeight: state.profile.preWeight,
        today: ui.today,
        width,
        height: width < 420 ? 200 : 260,
      });
    }
    const bpBox = document.getElementById('bp-chart');
    if (bpBox) {
      const width = Math.max(260, Math.round(bpBox.clientWidth));
      bpBox.innerHTML = Chart.bp({ records: state.bp, width, height: width < 420 ? 180 : 220 });
    }
  }

  // ---------- 弹窗 ----------

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
    const entry = state.glucose.find((g) => g.date === date && g.slot === slot);
    const target = M.glucoseTarget(slot, state.prefs.glucoseAfter);
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
    const r = id ? state.ultrasounds.find((u) => u.id === id) : null;
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
    showDialog(settingsDialog);
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
    showDialog(checkupDialog);
  }

  function openMedDialog(id) {
    const med = id ? state.meds.find((m) => m.id === id) : null;
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

  // ---------- 提示条 ----------

  let toastTimer = 0;
  function toast(message, undo) {
    // 打开的弹窗之外的内容点不到，提示条要放进最上面那个弹窗里，「撤销」才按得到
    const host = [...document.querySelectorAll('dialog[open]')].pop() || document.body;
    if (toastBox.parentNode !== host) host.appendChild(toastBox);
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

  function saveGlucose(f, beforeRender) {
    const previous = M.setGlucose(state, f);
    persist();
    beforeRender?.();
    render();
    const value = M.parseGlucose(f.value);
    const slot = C.GLUCOSE_SLOTS.find((s) => s.id === f.slot);
    const level = M.glucoseLevel(value, f.slot, state.prefs.glucoseAfter);
    const label = `${f.date === ui.today ? '今天' : D.formatDate(f.date)}${slot.name} ${glText(value)}`;
    toast(`${label} 记好了${GL_TAGS[level] ? `，${GL_TAGS[level]}` : ''}`, () => {
      M.removeGlucose(state, f.date, f.slot);
      if (previous) M.setGlucose(state, previous);
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
      closeDialog(settingsDialog);
      render();
      toast(dueChanged ? '预产期更新了，建议日期也跟着调整好了' : '保存好了');
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
      const record = M.addBp(state, f);
      persist();
      ui.clearInputs.push('bp-sys', 'bp-dia', 'bp-pulse', 'bp-date', 'bp-time');
      render();
      const level = M.bpLevel(record);
      const note = { severe: '，很高，注意看上面的提醒', high: '，偏高，休息一下再量一次', low: '，偏低' }[level] || '';
      toast(`${record.sys}/${record.dia} 记好了${note}`, () => M.removeBp(state, record.id));
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
      if (id) M.updateUltrasound(state, id, fields);
      else M.addUltrasound(state, fields);
      persist();
      closeDialog(sheetDialog);
      render();
      toast(id ? '保存好了' : '这次 B 超记好了');
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
      closeDialog(checkupDialog);
      render();
      toast(ck ? '保存好了' : '加好了，已经按孕周排进日程');
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
      if (id) M.updateMed(state, id, fields);
      else M.addMed(state, fields);
      persist();
      closeDialog(medDialog);
      render();
      toast(id ? '保存好了' : `记下了「${fields.name}」`);
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
      closeDialog(checkupDialog);
      render();
      toast(`删掉了「${removed.ck.title}」`, () => state.checkups.splice(removed.index, 0, removed.ck));
    },

    'add-med'() {
      openMedDialog(null);
    },

    'edit-med'(el) {
      openMedDialog(el.dataset.id);
    },

    'delete-med'(el) {
      const removed = M.removeMed(state, el.dataset.id);
      if (!removed) return;
      persist();
      closeDialog(medDialog);
      render();
      toast(`删掉了「${removed.med.name}」`, () => state.meds.splice(removed.index, 0, removed.med));
    },

    'stop-med'(el) {
      const stopped = M.stopMed(state, el.dataset.id, ui.today);
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
      M.startKicks(state, Date.now());
      ui.kickFeedback = '';
      persist();
      go('#/tools/kicks', 'kick-tap');
    },

    'tap-kick'() {
      const hit = M.tapKick(state, Date.now());
      if (hit) {
        ui.kickFeedback = hit.counted ? '上一下：算上 1 次' : '上一下：离上次不到 5 分钟，并成 1 次';
        persist();
        navigator.vibrate?.(25);
      }
      render();
    },

    'end-kicks'() {
      const now = Date.now();
      const k = M.endKicks(state, now);
      if (!k) return;
      ui.kickFeedback = '';
      persist();
      render();
      const r = M.kickReview(state, now).find((x) => x.session === k);
      toast(`这次数了 ${r.minutes} 分钟，胎动 ${r.count} 次`, () => { k.end = null; });
    },

    'delete-kicks'(el) {
      const removed = M.removeKicks(state, el.dataset.id);
      if (!removed) return;
      persist();
      render();
      toast('这次胎动记录删掉了', () => state.kicks.splice(removed.index, 0, removed.session));
    },

    'toggle-contraction'() {
      M.toggleContraction(state, Date.now());
      persist();
      render();
    },

    'delete-contraction'(el) {
      const removed = M.removeContraction(state, el.dataset.id);
      if (!removed) return;
      persist();
      render();
      toast('删掉了一条宫缩记录', () => state.contractions.splice(removed.index, 0, removed.contraction));
    },

    'clear-contractions'() {
      const before = state.contractions;
      if (!before.length) return;
      state.contractions = [];
      persist();
      render();
      toast('宫缩记录清空了', () => { state.contractions = before; });
    },

    'food-level'(el) {
      ui.foodLevel = el.dataset.level;
      render();
    },

    'delete-bp'(el) {
      const removed = M.removeBp(state, el.dataset.id);
      if (!removed) return;
      persist();
      render();
      toast(`删掉了 ${removed.record.sys}/${removed.record.dia} 这条`, () => state.bp.splice(removed.index, 0, removed.record));
    },

    'glucose-after'(el) {
      state.prefs.glucoseAfter = Number(el.dataset.after) === 1 ? 1 : 2;
      persist();
      render();
    },

    'edit-glucose'(el) {
      openGlucoseSheet(el.dataset.date, el.dataset.slot);
    },

    'delete-glucose'(el) {
      const removed = M.removeGlucose(state, el.dataset.date, el.dataset.slot);
      closeDialog(sheetDialog);
      if (!removed) return;
      persist();
      render();
      toast('删掉了这条血糖', () => M.setGlucose(state, removed));
    },

    'add-us'() {
      openUltrasoundSheet(null);
    },

    'edit-us'(el) {
      openUltrasoundSheet(el.dataset.id);
    },

    'delete-us'(el) {
      const removed = M.removeUltrasound(state, el.dataset.id);
      closeDialog(sheetDialog);
      if (!removed) return;
      persist();
      render();
      toast('删掉了这次 B 超记录', () => state.ultrasounds.splice(removed.index, 0, removed.record));
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
          closeDialog(settingsDialog);
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
      closeDialog(settingsDialog);
      render();
      toast('产检日程恢复成默认了', () => { state.checkups = before; });
    },

    'reset-bag'() {
      if (!window.confirm('恢复默认待产包会清掉默认物品的勾选、找回删掉的（自己添加的不受影响），确定吗？')) return;
      const before = state.bag;
      M.resetBag(state);
      persist();
      closeDialog(settingsDialog);
      render();
      toast('待产包恢复成默认清单了', () => { state.bag = before; });
    },

    'clear-all'() {
      if (!window.confirm('确定清空全部数据吗？清空后找不回来，建议先导出备份。')) return;
      S.clear();
      state = null;
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

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) {
      e.preventDefault();
      actions[el.dataset.action](el);
      return;
    }
    // 点当前所在的那个标签，回到页面顶部（和手机 App 的习惯一样）
    const link = e.target.closest('a[href^="#/"]');
    if (link && link.getAttribute('href') === (location.hash || '#/')) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.name === 'slot' && e.target.closest('.gl-form')) ui.glucoseSlot = e.target.value;
  });

  window.addEventListener('hashchange', () => {
    ui.bagAdding = null;
    ui.kickFeedback = '';
    render();
    if (!scrollToNow()) window.scrollTo(0, 0);
  });

  /** 每周变化页打开时直接停在现在这一段 */
  function scrollToNow() {
    const el = document.getElementById('wk-now');
    if (el) el.scrollIntoView({ block: 'start' });
    return Boolean(el);
  }

  document.addEventListener('submit', (e) => {
    const handler = forms[e.target.dataset.form];
    if (!handler) return;
    e.preventDefault();
    handler(e.target);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && e.target.id === 'bag-new') actions['cancel-bag-item']();
  });

  document.addEventListener('input', (e) => {
    if (e.target.id !== 'food-q') return;
    ui.foodQuery = e.target.value;
    document.getElementById('food-results').innerHTML = viewFoodResults();
  });

  for (const dialog of DIALOGS) {
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) closeDialog(dialog);
    });
    dialog.addEventListener('close', onDialogClose);
    dialog.addEventListener('cancel', () => setTimeout(onDialogClose, 0));
  }

  // 每秒刷新倒计时；数胎动满 1 小时自动结束
  function clock() {
    const now = Date.now();
    if (state && currentRoute().sub === 'contractions') {
      const running = M.activeContraction(state);
      const long = Boolean(running) && now - running.start > M.CONTRACTION_LONG;
      if (long !== Boolean(root.querySelector('.ctx-long'))) render();
    }
    const finished = state && M.settleKicks(state, now);
    if (!finished) return paintClocks(now);
    ui.kickFeedback = '';
    persist();
    render();
    const r = M.kickReview(state, now).find((x) => x.session === finished);
    toast(`1 小时到啦，这次胎动 ${r.count} 次`);
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
    if (!state) DIALOGS.forEach(closeDialog);
    render();
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawCharts, 120);
  });

  // 上次关页面时没数完的，打开时直接按满 1 小时收尾，不再弹提示
  if (state && M.settleKicks(state, Date.now())) persist();
  render();
  scrollToNow();
  checkNotifications();
  setInterval(clock, 1000);

  // 通过网址打开时离线也能用；直接双击打开的本地文件不需要
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
