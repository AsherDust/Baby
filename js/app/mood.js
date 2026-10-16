(function () {
  'use strict';
  // 「心情」页：选个心情、写几句，下面是按天排的时间线；首页「今天心情怎么样」那一条也在这里
  const { dates: D, journal: J, art: A, app } = globalThis.Baby;
  const { esc, ui } = app;

  const face = (mood) => `<span class="mood-face">${A.mood[mood]}</span>`;

  /** 第一行太长或者有好几行时，截一段加省略号 */
  function clip(text, max) {
    const line = text.split('\n')[0];
    return line.length > max || line !== text ? `${line.slice(0, max)}…` : line;
  }

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

  function viewJournalPage(route, { today }) {
    const list = app.state.journal;
    return `
      <article class="card card-mood">
        <header class="card-head">
          <div>
            <h2 class="card-title">${A.icon.smile}今天感觉怎么样？</h2>
            <p class="card-meta">${list.length ? `一共记了 ${list.length} 条` : '开心、累了、担心的时候，都可以来这里说说'}</p>
          </div>
        </header>
        <form class="mood-form" data-form="journal" novalidate>
          ${moodPicker(ui.journalMood)}
          <textarea id="j-text" name="text" rows="3" maxlength="${J.TEXT_MAX}" placeholder="想说点什么？写给自己，也可以写给宝宝（不写也行）" aria-label="想说的话" data-keep></textarea>
          <div class="mood-form-foot">
            <label class="mood-date"><span>记在</span><input type="date" id="j-date" name="date" value="${today}" max="${today}" data-keep></label>
            <button class="btn">记下来</button>
          </div>
          <p class="form-error" hidden></p>
        </form>
      </article>
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
          <small>${day.ga >= 0 ? `孕 ${D.formatGA(day.ga)} 周` : '孕前'}</small>
        </p>
        <ul class="mood-entries">
          ${day.entries.map((e) => `
            <li class="mood-entry mood-${e.mood}">
              ${face(e.mood)}
              <div class="mood-entry-body">
                <p class="mood-entry-head"><b>${J.moodOf(e.mood).name}</b>${e.time ? `<time>${e.time}</time>` : ''}</p>
                ${e.text ? `<p class="mood-entry-text">${esc(e.text)}</p>` : ''}
              </div>
              <button type="button" class="icon-btn icon-btn-sm" data-action="edit-journal" data-id="${esc(e.id)}" aria-label="改一改 ${D.formatDate(e.date)} 的这条" title="改一改">${A.icon.pencil}</button>
            </li>`).join('')}
        </ul>
      </section>`;
  }

  /** 首页：还没记就给一排小脸，点了去心情页接着写；记过了显示今天最新的一条 */
  function todoMood(today) {
    const latest = J.onDay(app.state.journal, today)[0];
    if (latest) {
      return `
        <li class="todo-item is-done">
          <span class="todo-icon todo-icon-mood">${A.mood[latest.mood]}</span>
          <div class="todo-body">
            <p class="todo-title">今天的心情：${J.moodOf(latest.mood).name}</p>
            <p class="todo-text">${latest.text ? `${esc(clip(latest.text, 24))} · ` : ''}<a class="link" href="#/journal">再写一条</a></p>
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

  Object.assign(app, { moodPicker, viewJournalPage, todoMood });
})();
