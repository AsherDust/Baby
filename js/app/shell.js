(function () {
  'use strict';
  // 整页渲染、换页、顶栏和底栏、开始页、图表，以及计时时屏幕常亮
  const { dates: D, model: M, chart: Chart, art: A, app } = globalThis.Baby;
  const {
    root, SECTIONS, TABS, SUB_VIEWS, SUB_NAMES, subName, esc, kg, isStandalone, isIOS, ui, afterRender, greeting, viewWeights, viewMeds,
    viewMom, viewWeeks, viewBp, viewGlucose, viewUltrasounds, viewCheckups, viewToolMenu, viewKicksTool, viewContractionsTool,
    viewFoodTool, viewRecipesTool, paintClocks, viewBag, viewStoryTool, viewStoryCard, viewSafety, viewBanner, viewWeek, viewBaby,
    viewToday, viewJournalPage, viewBabyPage, viewBornCard, viewBabyBanner, viewBabyHero, babyLive, drawGrowth, drawTrend, viewWeaningTool, viewPapersTool, viewPelvicTool, viewReportTool, viewNoiseTool
  } = app;
  const Bb = globalThis.Baby.baby;
  const BOOK = globalThis.Baby.babyBook;

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

    root.innerHTML = app.state ? viewApp() : viewOnboarding();

    for (const [id, value] of Object.entries(kept)) {
      const el = document.getElementById(id);
      if (el) el.value = value;
    }
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
    drawCharts();
    paintClocks(Date.now());
    syncWakeLock();
    afterRender.forEach((fn) => fn());

    if (app.state && app.state.baby) {
      const b = app.state.baby;
      document.title = `${b.name || '宝宝'} ${Bb.ageText(Bb.ageOf(b.birthDate, ui.today))} · 蜜罐`;
    } else if (app.state) {
      const ga = D.gestation(app.state.profile.dueDate, ui.today);
      document.title = `孕 ${ga.weeks} 周${ga.day ? ` + ${ga.day} 天` : ''} · 蜜罐`;
    } else {
      document.title = '蜜罐';
    }
  }

  function currentRoute() {
    const [section, sub = '', view = ''] = location.hash.replace(/^#\/?/, '').split('/');
    const id = SECTIONS[section] ? section : 'today';
    const subs = SECTIONS[id].subs;
    const page = subs.includes(sub) ? sub : subs[0];
    return { section: id, sub: page, view: (SUB_VIEWS[page] || []).includes(view) ? view : '' };
  }

  /** 换页；已经在这一页就直接重绘 */
  function go(hash, focusId = '') {
    ui.focusNext = focusId;
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function viewApp() {
    const route = currentRoute();
    const ctx = { today: ui.today, now: Date.now(), ga: D.gestation(app.state.profile.dueDate, ui.today) };
    const pages = {
      today: viewTodayPage, records: viewRecordsPage, checkups: viewCheckupsPage, tools: viewToolsPage, journal: viewJournalPage,
      baby: viewBabyPage,
    };
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
            <span class="brand-title">蜜罐</span>
            <span class="brand-sub">慢慢来，一切都刚刚好</span>
          </span>
        </a>
        <div class="topbar-side">
          <p class="topbar-date"><span class="topbar-greet">${greeting(new Date().getHours())}</span>${D.formatDate(today)} 星期${D.weekday(today)}</p>
          <button type="button" class="icon-btn" data-action="open-settings" aria-label="设置" title="设置">${A.icon.sliders}</button>
        </div>
      </header>`;
  }

  /** 手机上固定在底部、电脑上在顶部的主菜单；宝宝出生后「产检」换成「宝宝」，产检收进「记录」 */
  function viewTabbar(route) {
    const icons = { today: A.icon.home, records: A.icon.notes, checkups: A.icon.calendarHeart, tools: A.icon.grid, journal: A.icon.smile, baby: A.icon.bottle };
    const b = app.state.baby;
    let dot = M.reminders(M.scheduleRows(app.state, ui.today)).length ? 'checkups' : '';
    if (b) {
      const rows = Bb.vaccineRows(b, BOOK, ui.today);
      const exams = Bb.examReminders(Bb.examRows(b, BOOK, ui.today), ui.today);
      dot = Bb.vaccineReminders(rows, ui.today).length || rows.some((r) => r.status === 'late') || exams.length ? 'baby' : '';
    }
    const current = b && route.section === 'checkups' ? 'records' : route.section;
    return `
      <nav class="tabbar" aria-label="主菜单">
        ${TABS[b ? 'baby' : 'pregnant'].map((id) => `
          <a href="#/${id === 'today' ? '' : id}" class="tab"${current === id ? ' aria-current="page"' : ''}>
            <span class="tab-icon">${icons[id]}${dot === id ? '<i class="tab-dot" aria-label="有提醒"></i>' : ''}</span>
            <span class="tab-name">${SECTIONS[id].name}</span>
          </a>`).join('')}
      </nav>`;
  }

  /** 正在数胎动、正在计宫缩时，换到别的页面也挂一条提示，点一下回去 */
  function viewLive(route, now) {
    if (route.section === 'tools' && !route.sub) return '';
    const items = [];
    // 宝宝出生后，孕期的数胎动、宫缩计时不再挂出来
    const born = Boolean(app.state.baby);
    const kicks = born ? null : M.activeKicks(app.state, now);
    if (kicks && route.sub !== 'kicks') {
      items.push(`<a class="live" href="#/tools/kicks">${A.icon.feet}<span>正在数胎动 · 还剩 <b data-until="${kicks.start + M.KICK_WINDOW}"></b> · ${M.countedKicks(kicks.taps).length} 次</span>${A.icon.chevronRight}</a>`);
    }
    const contraction = born ? null : M.activeContraction(app.state);
    if (contraction && route.sub !== 'contractions') {
      items.push(`<a class="live live-alert" href="#/tools/contractions">${A.icon.timer}<span>宫缩计时中 · <b data-since="${contraction.start}"></b></span>${A.icon.chevronRight}</a>`);
    }
    items.push(...babyLive(route), ...app.noiseLive(route));
    return items.length ? `<div class="live-bar">${items.join('')}</div>` : '';
  }

  function segTabs(section, current) {
    const links = SECTIONS[section].subs.map((s) => [`#/${section}/${s}`, s]);
    // 宝宝出生后，产检和 B 超单放在「记录」里翻看
    if (section === 'records' && app.state.baby) links.push(...SECTIONS.checkups.subs.map((s) => [`#/checkups/${s}`, s]));
    return `
      <nav class="seg-tabs" aria-label="${SECTIONS[section].name}">
        ${links.map(([href, s]) => `<a href="${href}" class="seg-tab"${s === current ? ' aria-current="page"' : ''}>${SUB_NAMES[s]}</a>`).join('')}
      </nav>`;
  }

  function viewTodayPage(route, { today, now, ga }) {
    if (app.state.baby) {
      return `
        ${viewBabyBanner()}
        ${viewSafety(today)}
        ${viewStoryCard(now)}
        ${viewBabyHero(now)}
        <footer class="foot">
          <span class="foot-bee">${A.bee}</span>
          <p>记录只保存在这台设备的浏览器里，偶尔在设置里导出一份备份更安心。</p>
          <p>生长曲线是参考，疫苗以接种门诊的安排为准；宝宝不舒服时听医生的。</p>
        </footer>`;
    }
    const rows = M.scheduleRows(app.state, today);
    return `
      ${viewBanner(M.reminders(rows))}
      ${viewSafety(today)}
      ${viewBornCard(ga)}
      ${viewStoryCard(now)}
      <section class="hero">
        ${viewWeek(ga, app.state.profile.dueDate, today)}
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
    const body = route.sub === 'ultrasound' ? viewUltrasounds(today) : viewCheckups(M.scheduleRows(app.state, today), today);
    return `${segTabs(app.state.baby ? 'records' : 'checkups', route.sub)}${body}`;
  }

  function viewToolsPage(route, { now, ga }) {
    if (!route.sub) return viewToolMenu(ga, now);
    const views = {
      kicks: () => viewKicksTool(now),
      contractions: () => viewContractionsTool(now),
      food: () => viewFoodTool(),
      recipes: () => viewRecipesTool(route),
      weaning: () => viewWeaningTool(),
      papers: () => viewPapersTool(),
      pelvic: () => viewPelvicTool(),
      report: () => viewReportTool(),
      noise: () => viewNoiseTool(),
      bag: () => viewBag(ga),
      weeks: () => viewWeeks(ga),
      story: () => viewStoryTool(now),
    };
    return `
      <header class="page-head">
        <a href="#/tools" class="back">${A.icon.chevronLeft}<span>工具</span></a>
        <h1 class="page-title">${subName(route.sub)}</h1>
      </header>
      ${views[route.sub]()}`;
  }

  function viewOnboarding() {
    return `
      <main class="onboard">
        <div class="onboard-card">
          <div class="onboard-art">${A.scene}</div>
          <h1 class="onboard-title">欢迎来到蜜罐</h1>
          <p class="onboard-lead">先告诉我预产期，其它的都可以以后慢慢填。</p>
          <form class="onboard-form" data-form="onboard" novalidate>
            ${profileFields({})}
            <p class="form-error" hidden></p>
            <button class="btn btn-lg">开始记录</button>
          </form>
          <p class="onboard-import">
            <span>${isIOS() && isStandalone() ? '之前在浏览器里记过？先在浏览器里打开蜜罐，到「设置 → 导出备份」，再回这里导入。' : '换了手机，或者有之前导出的备份？'}</span>
            <button type="button" class="btn btn-ghost btn-sm" data-action="import-backup">导入备份</button>
          </p>
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
          <span>身高 <small>可选，cm</small></span>
          <input name="height" inputmode="decimal" autocomplete="off" placeholder="例如 160" value="${p.height != null ? p.height : ''}">
        </label>
      </div>
      <p class="hint">填上孕前体重和身高，体重曲线上会画出孕期该长多少。</p>
      <label class="field">
        <span>宝宝小名 <small>可选</small></span>
        <input name="nickname" maxlength="12" autocomplete="off" placeholder="例如 豆豆" value="${esc(p.nickname || '')}">
      </label>`;
  }

  function drawCharts() {
    if (!app.state) return;
    const weightBox = document.getElementById('weight-chart');
    if (weightBox) {
      const width = Math.max(260, Math.round(weightBox.clientWidth));
      weightBox.innerHTML = Chart.weight({
        weights: app.state.weights,
        dueDate: app.state.profile.dueDate,
        preWeight: app.state.profile.preWeight,
        plan: app.state.baby ? null : M.gainPlan(app.state.profile),
        today: ui.today,
        width,
        height: width < 420 ? 200 : 260,
      });
    }
    const bpBox = document.getElementById('bp-chart');
    if (bpBox) {
      const width = Math.max(260, Math.round(bpBox.clientWidth));
      bpBox.innerHTML = Chart.bp({ records: app.state.bp, width, height: width < 420 ? 180 : 220 });
    }
    drawGrowth();
    drawTrend();
  }

  // ---------- 计时、朗读时屏幕常亮 ----------
  // 数胎动要一小时、宫缩几分钟来一次，屏幕自动锁上就得反复解锁；锁屏后朗读也会停。
  // 切到后台时浏览器会自动放掉，回到前台 tick() 会再要回来；不支持或被拒绝（比如低电量模式）就算了

  let wakeLock = null;
  let wakeBusy = false;
  async function syncWakeLock() {
    if (!('wakeLock' in navigator) || wakeBusy) return;
    const busy = () => (!app.state.baby && M.keepScreenOn(app.state, Date.now(), currentRoute().sub === 'contractions')) || Boolean(ui.reading && ui.reading.playing) || Boolean(ui.pelvic);
    const want = Boolean(app.state) && !document.hidden && busy();
    if (want === Boolean(wakeLock)) return;
    wakeBusy = true;
    try {
      if (want) {
        const lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => {
          if (wakeLock === lock) wakeLock = null;
        });
        wakeLock = lock;
      } else {
        const lock = wakeLock;
        wakeLock = null;
        await lock.release();
      }
    } catch (e) {
      wakeLock = null;
    } finally {
      wakeBusy = false;
    }
  }

  Object.assign(app, { render, currentRoute, go, profileFields, drawCharts, syncWakeLock });
})();
