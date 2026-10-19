(function () {
  'use strict';
  // 「产检」页：B 超单和产检日程
  const { dates: D, content: C, model: M, art: A, app } = globalThis.Baby;
  const { esc, notifyPermission, isMobile } = app;

  // ---------- B 超 ----------

  const US_GROWTH = new Set(['crl', 'bpd', 'hc', 'ac', 'fl', 'efw']);
  const usText = (v) => String(Math.round(v * 10) / 10);

  function viewUltrasounds(today) {
    const rows = M.ultrasoundRows(app.state);
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
    // 手机浏览器不让网页直接弹通知（只能经推送服务器），关着页面也能准时提醒的只有日历
    if (isMobile()) {
      return `
        <div class="remind-strip">
          <p>${A.icon.bell}<span>到日子会在页面顶部提醒。不打开蜜罐也想准时收到？导入手机日历，会在<b>前一晚 8 点</b>和<b>当天</b>提醒你。</span></p>
          <button type="button" class="pill pill-btn" data-action="export-ics">${A.icon.calendarPlus}导入日历</button>
        </div>`;
    }
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
          ${ck.items.length ? `<p class="ck-items">${ck.items.map(esc).join('<i aria-hidden="true">·</i>')}</p>` : ''}
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

  Object.assign(app, { usText, viewUltrasounds, viewCheckups });
})();
