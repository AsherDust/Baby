(function () {
  'use strict';
  // 「今天」首页
  const { dates: D, content: C, model: M, art: A, app } = globalThis.Baby;
  const {
    BAG_REMIND_FROM, BAG_READY_BY, KICKS_FROM, esc, kg, kgDiff, clamp01, isWeChat, atRisk, todayKicks, kickResult,
    bagTiming, todoMood, todoMeal
  } = app;

  /** 首页的数据安全提示，一次只出一个：iPhone 浏览器里先劝加到主屏幕，否则到时候提醒备份 */
  function viewSafety(today) {
    if (atRisk() && !app.state.prefs.installHintHidden) {
      const how = isWeChat()
        ? '先点右上角「…」选「在 Safari 中打开」，再点底部的分享按钮，选「添加到主屏幕」。'
        : '点浏览器的分享按钮，选「添加到主屏幕」。';
      return `
        <section class="safety" aria-label="数据安全">
          <h2 class="safety-title">${A.icon.home}加到主屏幕，记录更稳</h2>
          <p>在浏览器里打开时，如果一个星期左右没用，iPhone 可能会自动清掉网站存的记录；从主屏幕图标打开就不会。${how}</p>
          <p class="safety-note">主屏幕图标里的记录和浏览器里是分开的两份：先在这里导出备份，再到图标里选「导入备份」。</p>
          <div class="btn-row">
            <button type="button" class="btn btn-sm" data-action="export-backup">${A.icon.download}导出备份</button>
            <button type="button" class="btn btn-ghost btn-sm" data-action="hide-install-hint">知道了</button>
          </div>
        </section>`;
    }
    const due = M.backupReminder(app.state, today);
    if (!due) return '';
    return `
      <section class="safety" aria-label="数据安全">
        <h2 class="safety-title">${A.icon.download}${due.last ? `上次备份是 ${due.days} 天前` : '还没备份过'}，存一份吧</h2>
        <p>记录只存在这台设备的浏览器里，换手机、清理浏览器数据都会丢。导出的备份可以存到「文件」、网盘，或者发给自己。</p>
        <div class="btn-row">
          <button type="button" class="btn btn-sm" data-action="export-backup">现在备份</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="snooze-backup">过几天再说</button>
        </div>
      </section>`;
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
    const who = esc(app.state.profile.nickname) || '宝宝';
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
          ${todoMood(today)}
          ${todoMeal(now)}
          ${todoKicks(ga, now)}
          ${todoWeight(M.weightSummary(app.state, today))}
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
          <div class="todo-head">
            <p class="todo-title">称个体重</p>
            <form class="quick-form" data-form="quick-weight" novalidate>
              <input id="quick-kg" name="kg" inputmode="decimal" autocomplete="off" placeholder="${ws.latest ? kg(ws.latest.kg) : '56.2'}" aria-label="今天的体重（千克）" data-keep>
              <span class="unit-label">kg</span>
              <button class="btn btn-sm">记下</button>
            </form>
          </div>
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
    const sum = M.bagSummary(app.state);
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

  function todoKicks(ga, now) {
    if (ga.days < KICKS_FROM) return '';
    const active = M.activeKicks(app.state, now);
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

  Object.assign(app, { viewSafety, viewBanner, viewWeek, viewBaby, viewToday });
})();
