(function () {
  'use strict';
  // 「宝宝」页（日常、成长、疫苗、健康、辅食）和宝宝出生后的首页；孕晚期首页上「宝宝出生了吗」那块也在这里
  const { dates: D, baby: Bb, babyBook: BOOK, babyFood: FOOD, recipeBook: RB, growthStandard: STD, chart: Chart, art: A, app } = globalThis.Baby;
  const { esc, ui, hhmm, TERM_FROM, todoMood, todoMeal, recipeDot } = app;

  const VIEWS = [['', '日常'], ['growth', '成长'], ['vaccines', '疫苗'], ['health', '健康'], ['food', '辅食']];
  const LEVEL_NAMES = { cool: '偏低', normal: '正常', low: '低热', mid: '中等发热', high: '高热' };
  const tagName = Object.fromEntries(FOOD.tags);
  const allergenName = Object.fromEntries(FOOD.allergens);
  const siteName = Object.fromEntries(BOOK.feverSites.map(([id, name]) => [id, name]));
  const colorOf = (id) => BOOK.pooColors.find((c) => c[0] === id) || null;
  const foodColors = { ...RB.colors, ...FOOD.colors };
  const foodDot = (r) => recipeDot(r, foodColors);

  const kid = () => app.state.baby;
  const who = () => esc(kid().name || app.state.profile.nickname || '宝宝');
  const ageNow = () => Bb.ageOf(kid().birthDate, ui.today);
  const sexName = (b) => (b.sex === 'boy' ? '男宝' : '女宝');

  /** 45 分钟 / 1 小时 20 分 */
  function minText(min) {
    if (min < 60) return `${min} 分钟`;
    return `${Math.floor(min / 60)} 小时${min % 60 ? ` ${min % 60} 分` : ''}`;
  }

  /** 刚刚 / 25 分钟前 / 2 小时 10 分前 */
  function agoText(ms, now) {
    const min = Math.max(0, Math.round((now - ms) / 60000));
    if (min >= 1440) return `${Math.floor(min / 1440)} 天前`;
    return min < 1 ? '刚刚' : `${minText(min)}前`;
  }

  /** 今天 08:30 / 昨天 22:10 / 10月3日 09:00 */
  function whenText(ms, now) {
    const day = Bb.dayOf(ms);
    const diff = D.diffDays(day, Bb.dayOf(now));
    return `${diff === 0 ? '今天' : diff === 1 ? '昨天' : D.formatDate(day)} ${hhmm(ms)}`;
  }

  function feedingTip() {
    const m = ageNow().months;
    return (BOOK.feeding.find((f) => m >= f.from && m < f.to) || BOOK.feeding[BOOK.feeding.length - 1]).tip;
  }

  // ---------- 一条条记录 ----------

  function logInfo(l, now) {
    switch (l.type) {
      case 'breast': {
        const t = Bb.breastSeconds(l, now);
        const parts = [t.left ? `左 ${Math.round(t.left / 60)} 分` : '', t.right ? `右 ${Math.round(t.right / 60)} 分` : ''].filter(Boolean);
        return { icon: A.icon.heart, name: '亲喂', text: l.end == null ? `喂奶中 · ${l.side === 'left' ? '左边' : '右边'}` : parts.join(' · ') || '不到 1 分钟' };
      }
      case 'bottle':
        return { icon: A.icon.bottle, name: '瓶喂', text: `${l.ml} 毫升 · ${l.milk === 'breast' ? '母乳' : '配方奶'}` };
      case 'food':
        return { icon: A.icon.bowl, name: '辅食', text: `${esc(l.text)}${l.amount ? ` · ${esc(l.amount)}` : ''}` };
      case 'sleep':
        return { icon: A.icon.moon, name: '睡觉', text: l.end == null ? '还在睡' : minText(Math.max(1, Math.round((l.end - l.start) / 60000))) };
      case 'diaper': {
        const c = l.poo && l.color ? colorOf(l.color) : null;
        return { icon: A.icon.diaper, name: '换尿布', text: `${l.pee && l.poo ? '尿和便' : l.pee ? '尿' : '便'}${c ? ` · ${c[1]}` : ''}`, alert: c ? c[2] : '' };
      }
      case 'temp': {
        const level = Bb.tempLevel(BOOK, l.value, l.site);
        return { icon: A.icon.thermo, name: '体温', text: `${l.value}℃ · ${siteName[l.site]} · ${LEVEL_NAMES[level]}`, warn: level !== 'normal' };
      }
      default:
        return { icon: A.icon.pill, name: '用药', text: `${esc(l.name)}${l.dose ? ` · ${esc(l.dose)}` : ''}` };
    }
  }

  const timeRange = (l) => (l.end && l.end - l.start >= 60000 ? `${hhmm(l.start)}–${hhmm(l.end)}` : hhmm(l.start));

  function viewLogRow(l, now) {
    const info = logInfo(l, now);
    return `
      <li class="blog${info.warn || info.alert ? ' is-warn' : ''}">
        <span class="blog-time">${timeRange(l)}</span>
        <span class="blog-icon">${info.icon}</span>
        <div class="blog-body">
          <p class="blog-title"><b>${info.name}</b>${info.text}</p>
          ${l.note ? `<p class="blog-note">${esc(l.note)}</p>` : ''}
          ${info.alert ? `<p class="blog-alert">${info.alert}</p>` : ''}
        </div>
        ${l.end === null ? '<span class="blog-live">进行中</span>' : `<button type="button" class="icon-btn icon-btn-sm" id="edit-${l.id}" data-action="baby-edit" data-id="${l.id}" aria-label="改一改这条${info.name}" title="改一改">${A.icon.pencil}</button>`}
      </li>`;
  }

  // ---------- 记一笔的按钮和当天小结 ----------

  function viewQuick() {
    const b = kid();
    const feed = Bb.running(b, 'breast');
    const sleep = Bb.running(b, 'sleep');
    const other = feed && feed.side === 'left' ? 'right' : 'left';
    const feedTile = feed ? `
      <div class="qt is-live">
        <p class="qt-name">${A.icon.heart}亲喂中 · ${feed.side === 'left' ? '左边' : '右边'}</p>
        <p class="qt-clock"><b data-elapsed="${feed.since}"></b><small>一共 <span data-elapsed="${feed.start}"></span></small></p>
        <div class="qt-row">
          <button type="button" class="qt-btn" id="breast-${other}" data-action="baby-breast" data-side="${other}">换${other === 'left' ? '左' : '右'}边</button>
          <button type="button" class="qt-btn is-main" id="breast-stop" data-action="baby-breast-stop">喂完了</button>
        </div>
      </div>` : `
      <div class="qt">
        <p class="qt-name">${A.icon.heart}亲喂</p>
        <div class="qt-row">
          <button type="button" class="qt-btn" id="breast-left" data-action="baby-breast" data-side="left">左边</button>
          <button type="button" class="qt-btn" id="breast-right" data-action="baby-breast" data-side="right">右边</button>
        </div>
      </div>`;
    const sleepTile = sleep ? `
      <div class="qt is-live is-sleep">
        <p class="qt-name">${A.icon.moon}睡着了</p>
        <p class="qt-clock"><b data-elapsed="${sleep.start}"></b><small>${hhmm(sleep.start)} 睡着的</small></p>
        <div class="qt-row"><button type="button" class="qt-btn is-main" id="sleep-toggle" data-action="baby-sleep">醒了</button></div>
      </div>` : `
      <div class="qt">
        <p class="qt-name">${A.icon.moon}睡觉</p>
        <div class="qt-row"><button type="button" class="qt-btn" id="sleep-toggle" data-action="baby-sleep">睡着了</button></div>
      </div>`;
    return `
      <div class="quick-tiles">
        ${feedTile}
        <div class="qt">
          <p class="qt-name">${A.icon.bottle}瓶喂</p>
          <div class="qt-row"><button type="button" class="qt-btn" id="log-bottle" data-action="baby-log" data-type="bottle">记一瓶</button></div>
        </div>
        ${sleepTile}
        <div class="qt">
          <p class="qt-name">${A.icon.diaper}换尿布</p>
          <div class="qt-row">
            <button type="button" class="qt-btn" id="diaper-pee" data-action="baby-diaper" data-what="pee">尿</button>
            <button type="button" class="qt-btn" id="diaper-poo" data-action="baby-diaper" data-what="poo">便</button>
            <button type="button" class="qt-btn" id="diaper-both" data-action="baby-diaper" data-what="both">都有</button>
          </div>
        </div>
      </div>
      <div class="qt-more" role="group" aria-label="记别的">
        <button type="button" class="chip" id="log-food" data-action="baby-log" data-type="food">${A.icon.bowl}辅食</button>
        <button type="button" class="chip" id="log-temp" data-action="baby-log" data-type="temp">${A.icon.thermo}体温</button>
        <button type="button" class="chip" id="log-med" data-action="baby-log" data-type="med">${A.icon.pill}用药</button>
        <button type="button" class="chip" id="log-breast" data-action="baby-log" data-type="breast">补记亲喂</button>
        <button type="button" class="chip" id="log-sleep" data-action="baby-log" data-type="sleep">补记睡觉</button>
      </div>`;
  }

  function viewSummary(s) {
    const feed = [s.breastMin ? `亲喂 ${minText(s.breastMin)}` : '', s.bottleMl ? `瓶喂 ${s.bottleMl} 毫升` : ''].filter(Boolean).join(' · ');
    return `
      <ul class="bsum">
        <li><span class="bsum-name">喂奶</span><b>${s.feeds}<small>次</small></b><span class="bsum-sub">${feed || '还没记'}</span></li>
        <li><span class="bsum-name">睡觉</span><b>${s.sleepMin >= 60 ? `${Math.floor(s.sleepMin / 60)}<small>小时</small>${s.sleepMin % 60 ? `${s.sleepMin % 60}<small>分</small>` : ''}` : `${s.sleepMin}<small>分钟</small>`}</b><span class="bsum-sub">${s.sleepMin ? '包括还在睡的' : '还没记'}</span></li>
        <li><span class="bsum-name">尿布</span><b>${s.diapers}<small>次</small></b><span class="bsum-sub">${s.diapers ? `尿 ${s.pee} · 便 ${s.poo}` : '还没记'}</span></li>
      </ul>`;
  }

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
    const views = { '': viewDaily, growth: viewGrowth, vaccines: viewVaccines, health: viewHealth, food: viewFood };
    return `
      <nav class="seg-tabs" aria-label="宝宝">
        ${VIEWS.map(([id, name]) => `<a href="#/baby${id ? `/${id}` : ''}" class="seg-tab"${route.sub === id ? ' aria-current="page"' : ''}>${name}</a>`).join('')}
      </nav>
      ${views[route.sub](now)}`;
  }

  function viewDaily(now) {
    const b = kid();
    const date = D.addDays(ui.today, ui.babyDay);
    const isToday = ui.babyDay === 0;
    const s = Bb.daySummary(b, date, now);
    const label = isToday ? '今天' : ui.babyDay === -1 ? '昨天' : D.formatDate(date);
    return `
      <article class="card baby-day">
        <header class="day-nav">
          <button type="button" class="icon-btn" id="baby-prev" data-action="baby-day" data-step="-1" aria-label="前一天"${date <= b.birthDate ? ' disabled' : ''}>${A.icon.chevronLeft}</button>
          <h2 class="day-title">${label}<small>${D.formatDate(date, { weekday: true })} · ${Bb.ageText(Bb.ageOf(b.birthDate, date))}</small></h2>
          <button type="button" class="icon-btn" id="baby-next" data-action="baby-day" data-step="1" aria-label="后一天"${isToday ? ' disabled' : ''}>${A.icon.chevronRight}</button>
        </header>
        ${viewSummary(s)}
        ${isToday && s.lastFeed ? `<p class="last-feed">上次喂奶：<b>${agoText(s.lastFeed, now)}</b></p>` : ''}
        ${isToday ? viewQuick() : ''}
      </article>
      <article class="card baby-tl" aria-label="${label}的记录">
        <header class="card-head">
          <h2 class="card-title">${A.icon.notes}${label}的记录</h2>
          <button type="button" class="btn btn-ghost btn-sm" id="log-more" data-action="baby-log" data-type="diaper" data-date="${date}">${A.icon.plus}补一条</button>
        </header>
        ${s.logs.length ? `<ul class="blog-list">${s.logs.map((l) => viewLogRow(l, now)).join('')}</ul>` : `<p class="food-empty">${isToday ? '点上面的按钮，一下就记好' : '这天没有记录'}</p>`}
      </article>
      <p class="fineprint">${feedingTip()}</p>`;
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
      ${viewMilestones()}`;
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
    const level = last ? Bb.tempLevel(BOOK, last.value, last.site) : null;
    const advice = last && Bb.isFever(level) && now - last.start < 24 * 3600000
      ? `<p class="rec-alert rec-alert-${level === 'high' || ageNow().days < 90 ? 'severe' : 'high'}">${A.icon.alert}<span>${ageNow().days < 90 ? '3 个月以下的宝宝发热，尽快去医院。' : BOOK.feverAdvice}</span></p>` : '';
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
        <ul class="dish-list">${picks.map((r) => viewFoodRow(r)).join('')}</ul>
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
        <details class="food-tried" id="food-tried"${ui.triedOpen ? ' open' : ''}>
          <summary>吃过的食材<small>${Object.keys(b.tried).length}/${foods.length}</small></summary>
          <p class="hint">记辅食时会自动勾上；没记的点一下也能勾。</p>
          <div class="recipe-chips">${foods.map((n) => `<button type="button" class="chip" id="tried-${esc(n)}" data-action="tried-toggle" data-food="${esc(n)}" aria-pressed="${Boolean(b.tried[n])}">${esc(n)}</button>`).join('')}</div>
        </details>
      </article>
      <p class="fineprint">参考《中国 7～24 月龄婴幼儿喂养指南（2022）》。早产、过敏体质、长得慢的宝宝，什么时候加、加什么听医生的。</p>`;
  }

  function viewFoodRow(r) {
    const fresh = kid() ? Bb.newFoods(FOOD, kid(), r) : [];
    const tags = [...r.good.map((g) => tagName[g]), ...r.allergens.map((a) => `含${allergenName[a]}`)];
    return `
      <li class="dish">
        <button type="button" class="dish-open" id="food-${r.id}" data-action="baby-food-open" data-id="${r.id}">
          ${foodDot(r)}
          <span class="dish-name">${esc(r.name)}${fresh.length ? `<span class="tag tag-next">新：${fresh.map(esc).join('、')}</span>` : ''}</span>
          <span class="dish-meta">${r.minutes} 分钟 · ${tags.join(' · ')}</span>
        </button>
      </li>`;
  }

  // ---------- 首页 ----------

  /** 孕晚期首页：宝宝出生了吗 */
  function viewBornCard(ga) {
    if (ga.days < TERM_FROM || kid()) return '';
    return `
      <section class="safety born-card" aria-label="宝宝出生了吗">
        <h2 class="safety-title">${A.icon.heart}宝宝出生了吗？</h2>
        <p>记下出生的日子，蜜罐就换成宝宝的一天：喂奶、睡觉、换尿布一下就能记，还有生长曲线和疫苗提醒。</p>
        <div class="btn-row"><button type="button" class="btn btn-sm" data-action="baby-birth-open">宝宝出生了</button></div>
      </section>`;
  }

  /** 今天、明天约了疫苗的，挂在首页最上面 */
  function viewBabyBanner() {
    const list = Bb.vaccineReminders(Bb.vaccineRows(kid(), BOOK, ui.today), ui.today);
    if (!list.length) return '';
    return `
      <section class="banner" role="status">
        <span class="banner-bee">${A.bee}</span>
        <div class="banner-list">
          ${list.map((r) => {
            const day = !r.booked || r.booked === ui.today ? '今天' : '明天';
            return `
              <div class="banner-item">
                <div>
                  <p class="banner-title">${day}${r.booked ? '打疫苗' : '起可以打'}：${r.name}第 ${r.dose} 剂</p>
                  <p class="banner-text">带上预防接种证；打完在接种门诊留观 30 分钟。</p>
                </div>
                ${day === '今天' ? `<button type="button" class="btn btn-sm" data-action="vaccine-done" data-id="${r.id}">打完了</button>` : ''}
              </div>`;
          }).join('')}
        </div>
      </section>`;
  }

  function viewBabyHero(now) {
    const b = kid();
    const age = ageNow();
    const s = Bb.daySummary(b, ui.today, now);
    const last = b.growth[b.growth.length - 1];
    return `
      <section class="hero hero-baby">
        <article class="panel panel-week panel-baby-age">
          <span class="panel-comb">${A.honeycomb}</span>
          <p class="eyebrow">${who()} · ${sexName(b)}</p>
          <p class="week-big" aria-label="出生第 ${age.days + 1} 天"><span class="unit">第</span><span class="num">${age.days + 1}</span><span class="unit">天</span></p>
          <p class="week-sub">${Bb.ageText(age)} · ${D.formatDate(b.birthDate, { year: true })} 出生</p>
          ${last ? `<p class="baby-stats">${Bb.METRICS.filter((m) => last[m.id] != null).map((m) => `<span>${m.name} ${last[m.id]} ${m.unit}</span>`).join('')}</p>` : ''}
          <p class="due-line">${last ? `${D.formatDate(last.date)} 量的` : '还没量过身长体重'}<a class="link" href="#/baby/growth">成长档案</a></p>
        </article>
        <article class="panel panel-baby-now">
          <p class="eyebrow">今天</p>
          ${viewSummary(s)}
          ${s.lastFeed ? `<p class="last-feed">上次喂奶：<b>${agoText(s.lastFeed, now)}</b></p>` : ''}
          ${viewQuick()}
        </article>
        ${viewBabyTodo(now)}
      </section>`;
  }

  function todoItem({ icon, title, text, action = '', done = false, alert = false }) {
    return `
      <li class="todo-item${done ? ' is-done' : ''}">
        <span class="todo-icon${alert ? ' todo-icon-alert' : ''}">${done ? A.icon.check : icon}</span>
        <div class="todo-body">
          <p class="todo-title">${title}</p>
          ${text ? `<p class="todo-text">${text}</p>` : ''}
          ${action ? `<div class="todo-actions">${action}</div>` : ''}
        </div>
      </li>`;
  }

  /** 今天推荐的辅食，点菜名直接看做法 */
  function todoFood(picks) {
    return `
      <li class="todo-item">
        <span class="todo-icon">${A.icon.bowl}</span>
        <div class="todo-body">
          <div class="todo-head">
            <p class="todo-title">今天的辅食</p>
            <a class="link" href="#/baby/food">全部辅食</a>
          </div>
          <ul class="meal-chips">${picks.map((r) => `
            <li><button type="button" class="meal-chip" id="food-chip-${r.id}" data-action="baby-food-open" data-id="${r.id}">${foodDot(r)}${esc(r.name)}</button></li>`).join('')}
          </ul>
        </div>
      </li>`;
  }

  function viewBabyTodo(now) {
    const b = kid();
    const age = ageNow();
    const items = [];
    const vitD = b.logs.some((l) => l.type === 'med' && /维生素\s*A?D|维\s*A?D|AD\s*滴/i.test(l.name) && Bb.dayOf(l.start) === ui.today);
    items.push(vitD
      ? todoItem({ title: '今天的维生素 D 喂过了', text: '每天 400 国际单位', done: true })
      : todoItem({ icon: A.icon.pill, title: '维生素 D', text: '每天 400 国际单位；配方奶喂养的，补多少听医生的', action: '<button type="button" class="btn btn-ghost btn-sm" id="vitd-done" data-action="vitd-done">喂过了</button>' }));
    const rows = Bb.vaccineRows(b, BOOK, ui.today);
    const late = rows.filter((r) => r.status === 'late');
    const next = Bb.nextVaccine(rows);
    if (late.length) {
      items.push(todoItem({ icon: A.icon.syringe, alert: true, title: `有 ${late.length} 针过了建议的时间`, text: `${late.slice(0, 2).map((r) => `${r.name}第 ${r.dose} 剂`).join('、')} · <a class="link" href="#/baby/vaccines">去看看</a>` }));
    } else if (next) {
      const when = next.booked ? `约在 ${D.formatDate(next.booked, { weekday: true })}` : next.status === 'due' ? '已经可以打了' : `${D.formatDate(next.due)}起可以打`;
      items.push(todoItem({ icon: A.icon.syringe, title: `下一针：${next.name}第 ${next.dose} 剂`, text: `${when} · <a class="link" href="#/baby/vaccines">疫苗</a>` }));
    }
    const lastGrowth = b.growth[b.growth.length - 1];
    const gap = lastGrowth ? D.diffDays(lastGrowth.date, ui.today) : Infinity;
    if (gap >= (age.months < 6 ? 30 : 90)) {
      items.push(todoItem({ icon: A.icon.scale, title: '量量身长体重', text: `${lastGrowth ? `上次是 ${D.formatDate(lastGrowth.date)}` : '量了记下来，看看长在哪条线附近'} · <a class="link" href="#/baby/growth">去记</a>` }));
    }
    const ms = Bb.milestoneRows(b, BOOK, ui.today).find((r) => r.status === 'now');
    if (ms) items.push(todoItem({ icon: A.icon.flag, title: `这阵子可能会：${ms.name}`, text: `会了就记一下，以后翻着看 · <a class="link" href="#/baby/growth">里程碑</a>` }));
    if (age.months >= 6) {
      const picks = Bb.foodToday(FOOD, BOOK, b, ui.today);
      if (picks.length) items.push(todoFood(picks));
    }
    items.push(todoMeal(now));
    items.push(todoMood(ui.today));
    return `
      <article class="panel panel-today">
        <p class="eyebrow">今天该记</p>
        <ul class="todo">${items.join('')}</ul>
      </article>`;
  }

  /** 正在喂奶、正在睡觉时，换到别的页面也挂一条，点一下回到「宝宝」 */
  function babyLive(route) {
    if (!kid() || route.section === 'today' || (route.section === 'baby' && !route.sub)) return [];
    const b = kid();
    const out = [];
    const feed = Bb.running(b, 'breast');
    if (feed) out.push(`<a class="live" href="#/baby">${A.icon.heart}<span>亲喂中 · ${feed.side === 'left' ? '左边' : '右边'} <b data-elapsed="${feed.since}"></b></span>${A.icon.chevronRight}</a>`);
    const sleep = Bb.running(b, 'sleep');
    if (sleep) out.push(`<a class="live live-sleep" href="#/baby">${A.icon.moon}<span>睡着了 · <b data-elapsed="${sleep.start}"></b></span>${A.icon.chevronRight}</a>`);
    return out;
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

  Object.assign(app, {
    viewBabyPage, viewBornCard, viewBabyBanner, viewBabyHero, babyLive, drawGrowth, babyMinText: minText, babyLogInfo: logInfo,
    babyFoodDot: foodDot, viewWeaningTool: viewFood
  });
})();
