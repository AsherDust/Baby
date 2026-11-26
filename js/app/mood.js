(function () {
  'use strict';
  // 「心情」页：选个心情、写几句，下面是按天排的时间线；首页「今天心情怎么样」那一条也在这里
  const { dates: D, model: M, journal: J, baby: Bb, art: A, app } = globalThis.Baby;
  const { esc, ui } = app;

  const checkupHeart = '<span class="mcal-heart" aria-hidden="true">♥</span>';
  const face = (mood) => `<span class="mood-face">${A.mood[mood]}</span>`;

  /** 选心情的一排小脸，表单里叫 mood */
  function moodPicker(selected) {
    return `
      <div class="mood-pick" role="radiogroup" aria-label="心情">
        ${J.MOODS.map((m) => `
          <label class="mood-opt mood-${m.id}">
            <input type="radio" name="mood" value="${m.id}"${m.id === selected ? ' checked' : ''}>
            ${face(m.id)}
            <span class="mood-name">${m.name}</span>
          </label>`).join('')}
      </div>`;
  }

  const STAGE_NAMES = { pre: '孕前', early: '孕早期', mid: '孕中期', late: '孕晚期', post: '产后' };
  const WEEK_HEAD = ['一', '二', '三', '四', '五', '六', '日'];

  /** 月历覆盖心情记录和产检日程，初次打开仍显示本月。 */
  function monthRange(today, rows) {
    const list = app.state.journal;
    const dates = [today, D.lmpFromDue(app.state.profile.dueDate)];
    if (list.length) dates.push(list[list.length - 1].date);
    if (rows.length) dates.push(rows[0].status.date);
    const last = rows.length && rows[rows.length - 1].status.date > today ? rows[rows.length - 1].status.date : today;
    return { first: dates.sort()[0].slice(0, 7), last: last.slice(0, 7) };
  }

  function calendarCell(c, pop, checkupDates) {
    if (!c) return '<span class="mcal-cell is-blank" aria-hidden="true"></span>';
    const cls = `mcal-cell st-${c.stage}${c.isToday ? ' is-today' : ''}${c.latest ? ` has-mood mood-${c.latest.mood}` : ''}${c.date === pop ? ' is-pop' : ''}`;
    const checkup = checkupDates.has(c.date);
    if (c.future && !checkup) return `<span class="${cls} is-future" aria-hidden="true"><span class="mcal-num">${c.day}</span></span>`;
    const what = c.latest ? `${J.moodOf(c.latest.mood).name}${c.count > 1 ? `，记了 ${c.count} 条` : ''}` : '还没记';
    const inner = c.latest
      ? `${face(c.latest.mood)}${c.count > 1 ? `<span class="mcal-count">${c.count}</span>` : ''}`
      : `<span class="mcal-num">${c.day}</span>${c.isToday ? '<span class="mcal-tap" aria-hidden="true">打卡</span>' : ''}`;
    return `<button type="button" class="${cls}" data-action="mood-day" data-date="${c.date}" aria-label="${D.formatDate(c.date)}${c.isToday ? '（今天）' : ''}，${STAGE_NAMES[c.stage]}${checkup ? '，有产检' : ''}${c.future ? '' : '，' + what}">${checkup ? checkupHeart : ''}${inner}</button>`;
  }

  /** 给人一点打卡的劲头：这个月是当前月时说连着记了几天，翻到别的月就说那个月记了几天 */
  function calendarCheer(cal, today, checkupDates) {
    if (cal.month > today.slice(0, 7)) {
      const days = cal.cells.filter((c) => c && checkupDates.has(c.date)).length;
      return days ? `这个月有 <b>${days}</b> 天产检` : '这个月没有产检安排';
    }
    if (cal.month !== today.slice(0, 7)) return cal.days ? `这个月记了 <b>${cal.days}</b> 天` : '这个月没有记录';
    const s = J.streak(app.state.journal, today);
    if (s.today) return s.days > 1 ? `已经连着记了 <b>${s.days}</b> 天，真棒` : '今天打过卡啦，明天也来哦~';
    if (s.days) return `已经连着记了 <b>${s.days}</b> 天，今天也来记一下吧`;
    return '今天还没记，点一下今天那格打个卡';
  }

  function viewMoodCalendar(today) {
    const rows = M.scheduleRows(app.state, today);
    const checkupDates = new Set(rows.map(({ status }) => status.date));
    const { first, last } = monthRange(today, rows);
    const selected = ui.moodMonth || today.slice(0, 7);
    const month = selected < first ? first : selected > last ? last : selected;
    const b = app.state.baby;
    const cal = J.calendar(app.state.journal, month, { dueDate: app.state.profile.dueDate, birthDate: b ? b.birthDate : null, today });
    const pop = ui.moodPop;
    ui.moodPop = '';
    const [y, m] = month.split('-').map(Number);
    const tally = J.MOODS
      .map((x) => [x, app.state.journal.filter((e) => e.mood === x.id && e.date.startsWith(month)).length])
      .filter(([, n]) => n);
    return `
      <article class="card mcal" aria-label="心情月历" data-month="${month}">
        <header class="day-nav mcal-nav">
          <button type="button" class="icon-btn" data-action="mood-month" data-step="-1" aria-label="上个月"${month <= first ? ' disabled' : ''}>${A.icon.chevronLeft}</button>
          <h2 class="day-title">${y} 年 ${m} 月<small>${calendarCheer(cal, today, checkupDates)}</small></h2>
          <button type="button" class="icon-btn" data-action="mood-month" data-step="1" aria-label="下个月"${month >= last ? ' disabled' : ''}>${A.icon.chevronRight}</button>
        </header>
        <div class="mcal-grid">
          ${WEEK_HEAD.map((w) => `<span class="mcal-week" aria-hidden="true">${w}</span>`).join('')}
          ${cal.cells.map((c) => calendarCell(c, pop, checkupDates)).join('')}
        </div>
        <div class="mcal-foot">
          ${tally.length ? `<ul class="mcal-tally" aria-label="这个月的心情">${tally.map(([x, n]) => `<li class="mood-${x.id}" title="${x.name}">${face(x.id)}<b>${n}</b></li>`).join('')}</ul>` : ''}
          <button type="button" class="mcal-stats-toggle" data-action="mood-stats" aria-expanded="${ui.moodStatsOpen}" aria-controls="mood-stats">统计</button>
        </div>
        <div id="mood-stats"${ui.moodStatsOpen ? '' : ' hidden'}>${ui.moodStatsOpen ? viewStageCounts(app.state.journal) : ''}</div>
      </article>`;
  }

  function viewStageCounts(list) {
    const { profile, baby } = app.state;
    const counts = Object.fromEntries(Object.keys(STAGE_NAMES).map((stage) => [stage, { total: 0 }]));
    for (const entry of list) {
      const row = counts[J.stageOn(entry.date, profile.dueDate, baby?.birthDate)];
      row.total += 1;
      row[entry.mood] = (row[entry.mood] || 0) + 1;
    }
    const stages = Object.keys(STAGE_NAMES).filter((stage) => stage !== 'pre' || counts.pre.total);
    return `
      <p class="card-meta mood-stats-total">一共记了 ${list.length} 条</p>
      <table class="mood-stage-counts" aria-label="各阶段的心情">
        <thead><tr><th scope="col" aria-label="各阶段合计"><span class="mood-total-icon" aria-hidden="true">${A.icon.smile}</span>合计</th>${J.MOODS.map((m) => `<th scope="col">${face(m.id)}${m.name}</th>`).join('')}</tr></thead>
        <tbody>${stages.map((stage) => `
          <tr><th class="st-${stage}" scope="row" aria-label="${STAGE_NAMES[stage]}，共 ${counts[stage].total} 条"><span class="mood-stage-name">${STAGE_NAMES[stage].slice(-2)}</span><small>${counts[stage].total}<span class="mood-count-unit"> 条</span></small></th>
            ${J.MOODS.map((m) => `<td class="st-${stage}">${counts[stage][m.id] || 0}</td>`).join('')}
          </tr>`).join('')}</tbody>
      </table>`;
  }

  function viewJournalPage(route, { today }) {
    const list = app.state.journal;
    return `
      ${viewMoodCare(today)}
      ${viewMoodCalendar(today)}
      ${viewTimeline(list, today)}`;
  }

  function viewTimeline(list, today) {
    if (!list.length) {
      return `
        <article class="card card-mood-tl">
          <div class="empty">
            <span class="empty-art empty-bee">${A.bee}</span>
            <p>这里会按日子排好你记下的心情。<br>等宝宝长大了，翻出来一起看看。</p>
          </div>
        </article>`;
    }
    const tl = J.timeline(list, app.state.profile.dueDate, ui.journalShown);
    let month = '';
    const parts = tl.days.map((day) => {
      let head = '';
      if (day.month !== month) {
        month = day.month;
        const [y, m] = month.split('-').map(Number);
        head = `<h3 class="mood-month">${y} 年 ${m} 月<small>${tl.months[month]} 条</small></h3>`;
      }
      return head + viewDay(day, today);
    });
    return `
      <article class="card card-mood-tl" aria-label="心情时间线">
        ${parts.join('')}
        ${tl.more ? `<button type="button" class="link link-more" data-action="journal-more">看更早的（还有 ${tl.more} 条）</button>` : ''}
      </article>`;
  }

  /** 那天是孕几周；宝宝出生以后写宝宝多大，只到月，窄的那一栏放得下 */
  function dayAge(date) {
    const b = app.state.baby;
    if (b && date >= b.birthDate) {
      const age = Bb.ageOf(b.birthDate, date);
      return age.days === 0 ? '出生那天' : `${Bb.ageText({ ...age, rest: 0 })}大`;
    }
    const ga = D.gestation(app.state.profile.dueDate, date).days;
    return ga >= 0 ? `孕 ${D.formatGA(ga)} 周` : '孕前';
  }

  /** 一条心情：小脸、心情、几点、想说的话，右边能改 */
  function moodEntry(e) {
    return `
      <li class="mood-entry mood-${e.mood}">
        ${face(e.mood)}
        <div class="mood-entry-body">
          <p class="mood-entry-head"><b>${J.moodOf(e.mood).name}</b>${e.time ? `<time>${e.time}</time>` : ''}</p>
          ${e.text ? `<p class="mood-entry-text">${esc(e.text)}</p>` : ''}
        </div>
        <button type="button" class="icon-btn icon-btn-sm" data-action="edit-journal" data-id="${esc(e.id)}" aria-label="改一改 ${D.formatDate(e.date)} 的这条" title="改一改">${A.icon.pencil}</button>
      </li>`;
  }

  function viewDay(day, today) {
    const ago = D.diffDays(day.date, today);
    const [, m, d] = day.date.split('-').map(Number);
    const label = ago === 0 || ago === 1
      ? `<b class="mood-day-rel">${ago ? '昨天' : '今天'}</b>`
      : `<b class="mood-day-num">${d}</b><span class="mood-day-mon">${m}月</span>`;
    return `
      <section class="mood-day">
        <p class="mood-day-date">
          ${label}
          <small>${dayAge(day.date)}</small>
        </p>
        <ul class="mood-entries">${day.entries.map(moodEntry).join('')}</ul>
      </section>`;
  }

  /** 最近两周心情不太好的日子多时才有；收起后 7 天内不再出现 */
  function moodCare(today) {
    const c = J.careCheck(app.state.journal, today);
    const hidden = app.state.prefs.moodCareHidden;
    return c.show && !(hidden && D.diffDays(hidden, today) < 7) ? c : null;
  }

  /** 心情页顶上：说几句宽心的话，什么情况要去看医生，给出心理援助热线 */
  function viewMoodCare(today) {
    const c = moodCare(today);
    if (!c) return '';
    const born = Boolean(app.state.baby);
    return `
      <section class="mood-care" aria-label="关心一下你">
        <span class="mood-care-icon">${A.icon.heart}</span>
        <div class="mood-care-body">
          <p class="mood-care-title">最近两周有 ${c.days} 天心情低落或焦虑，抱抱你</p>
          <p>${born
            ? '产后情绪起伏很常见，不是你做得不好，也不是矫情。睡不够的时候尤其容易这样，夜里让家人多分担一些；42 天复查时也可以跟医生说说最近的心情。'
            : '孕期情绪起伏很常见，不是你做得不好。找家人或朋友说说；下次产检时，也可以跟医生说说最近的心情。'}</p>
          <p>如果低落、提不起兴趣已经持续两周以上，或者有伤害自己${born ? '、伤害宝宝' : ''}的念头，请尽快去医院的心理科或精神科；也可以先打 12356 心理援助热线聊一聊。情况紧急时拨打 120。</p>
          <div class="mood-care-actions">
            <a class="btn btn-sm" href="tel:12356">打 12356</a>
            <button type="button" class="btn btn-ghost btn-sm" data-action="mood-care-hide">过几天再说</button>
          </div>
          <p class="mood-care-note">12356 是国家卫生健康委设置的全国统一心理援助热线。</p>
        </div>
      </section>`;
  }

  /** 首页「今天该记」里的一条，详细的在心情页 */
  function todoMoodCare(today) {
    const c = moodCare(today);
    if (!c) return '';
    return `
      <li class="todo-item">
        <span class="todo-icon todo-icon-care">${A.icon.heart}</span>
        <div class="todo-body">
          <p class="todo-title">最近心情不太好的日子有点多</p>
          <p class="todo-text">两周里有 ${c.days} 天低落或焦虑。说出来会好一些，也可以打 <a class="link" href="tel:12356">12356</a> 心理援助热线 · <a class="link" href="#/journal">看看</a></p>
        </div>
      </li>`;
  }

  /** 首页：还没记就给一排小脸，点了去心情页接着写；记过了显示今天最新的一条 */
  function todoMood(today) {
    const latest = J.onDay(app.state.journal, today)[0];
    if (latest) {
      return `
        <li class="todo-item is-done">
          <span class="todo-icon todo-icon-mood">${A.mood[latest.mood]}</span>
          <div class="todo-body">
            <div class="todo-head">
              <p class="todo-title">今天的心情：${J.moodOf(latest.mood).name}${latest.time ? ` <time>${latest.time}</time>` : ''}</p>
              <a class="link" href="#/journal" data-action="journal-start">再写一条</a>
            </div>
            ${latest.text ? `<p class="todo-text todo-mood-note">${esc(latest.text)}</p>` : ''}
          </div>
        </li>`;
    }
    return `
      <li class="todo-item">
        <span class="todo-icon">${A.icon.smile}</span>
        <div class="todo-body">
          <p class="todo-title">今天心情怎么样？</p>
          <div class="mood-quick" role="group" aria-label="选一个心情，去写几句">
            ${J.MOODS.map((m) => `
              <button type="button" class="mood-quick-btn mood-${m.id}" data-action="journal-start" data-mood="${m.id}">
                ${face(m.id)}<span class="mood-name">${m.name}</span>
              </button>`).join('')}
          </div>
          <p class="todo-text">点一个，想说的话写两句也行</p>
        </div>
      </li>`;
  }

  Object.assign(app, { checkupHeart, moodPicker, moodEntry, moodDayAge: dayAge, MOOD_STAGES: STAGE_NAMES, viewJournalPage, todoMood, todoMoodCare });
})();
