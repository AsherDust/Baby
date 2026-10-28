(function () {
  'use strict';
  // 「工具」页：工具目录、数胎动、宫缩计时、能不能吃、待产包（孕期食谱在 recipes.js）
  const { dates: D, content: C, model: M, art: A, app } = globalThis.Baby;
  const { SUB_NAMES, BAG_REMIND_FROM, BAG_READY_BY, KICKS_FROM, TERM_FROM, esc, pad2, hhmm, ui, storyStatus, recipeStatus } = app;

  /** 今天（按真实时钟）数完的几次，新的在前 */
  function todayKicks(now) {
    const day = D.localISO(new Date(now));
    return M.kickReview(app.state, now).filter((r) => !r.running && r.date === day);
  }

  const kickResult = (r) => (r.full ? `1 小时 ${r.count} 次` : `${r.minutes} 分钟 ${r.count} 次`);

  function bagTiming(ga) {
    if (ga.days < BAG_REMIND_FROM) return '一般 32 周起慢慢收拾，36 周前备齐';
    if (ga.days < BAG_READY_BY) return `最好 36 周前备齐，还有 ${BAG_READY_BY - ga.days} 天`;
    return '快足月了，尽快备齐，证件放在最上面';
  }

  function viewToolMenu(ga, now) {
    const tile = (id, icon, { text, live = false }) => `
      <a class="tool${live ? ' is-live' : ''}" href="#/tools/${id}" data-tool="${id}">
        <span class="tool-icon">${icon}</span>
        <span class="tool-text"><span class="tool-name">${SUB_NAMES[id]}</span><span class="tool-status">${text}</span></span>
        <span class="tool-go">${A.icon.chevronRight}</span>
      </a>`;
    const bag = M.bagSummary(app.state);
    // 宝宝出生后，只在孕期用的几样收起来
    const born = Boolean(app.state.baby);
    return `
      <section class="tool-menu" aria-label="小工具">
        ${born ? '' : tile('kicks', A.icon.feet, kickStatus(ga, now))}
        ${born ? '' : tile('contractions', A.icon.timer, contractionStatus(ga, now))}
        ${tile('food', A.icon.bowl, { text: `${C.FOODS.length} 种常见食物，搜一下就知道` })}
        ${tile('recipes', A.icon.pot, recipeStatus(now))}
        ${born ? '' : tile('bag', A.icon.suitcase, { text: bag.total ? `已备好 ${bag.done}/${bag.total}` : '清单空了，去加几样' })}
        ${born ? '' : tile('weeks', A.icon.book, { text: `现在是第 ${Math.max(ga.weeks, 0)} 周，看看宝宝和妈妈的变化` })}
        ${tile('story', A.icon.moon, storyStatus(now))}
      </section>`;
  }

  function kickStatus(ga, now) {
    const active = M.activeKicks(app.state, now);
    if (active) return { live: true, text: `正在数 · 还剩 <b data-until="${active.start + M.KICK_WINDOW}"></b> · ${M.countedKicks(active.taps).length} 次` };
    const today = todayKicks(now);
    if (today.length) return { text: `今天数了 ${today.length} 回 · 最近 ${kickResult(today[0])}` };
    return { text: ga.days < KICKS_FROM ? '28 周起每天数一数' : '今天还没数' };
  }

  function contractionStatus(ga, now) {
    const running = M.activeContraction(app.state);
    if (running) return { live: true, text: `宫缩中 · <b data-since="${running.start}"></b>` };
    const stats = M.contractionStats(app.state, now);
    if (stats.count >= 2) return { text: `最近 1 小时 ${stats.count} 次 · 约 ${stats.avgInterval} 分钟一次` };
    const last = M.contractionRows(app.state, now)[0];
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
    const ga = D.gestation(app.state.profile.dueDate, ui.today);
    const rows = M.kickReview(app.state, now);
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
    const ga = D.gestation(app.state.profile.dueDate, ui.today);
    const running = M.activeContraction(app.state);
    const stats = M.contractionStats(app.state, now);
    const rows = M.contractionRows(app.state, now).slice(0, 30);
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

  /** 喂奶、睡觉这种可能超过一小时的：1:05 / 1:20:05 */
  function elapsedText(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    return h ? `${h}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}` : clockText(ms);
  }

  function paintClocks(now) {
    document.querySelectorAll('[data-until]').forEach((el) => { el.textContent = clockText(Number(el.dataset.until) - now); });
    document.querySelectorAll('[data-since]').forEach((el) => { el.textContent = clockText(now - Number(el.dataset.since)); });
    document.querySelectorAll('[data-elapsed]').forEach((el) => { el.textContent = elapsedText(now - Number(el.dataset.elapsed)); });
  }

  function viewBag(ga) {
    const sum = M.bagSummary(app.state);
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
        <div class="bag-groups">${M.bagGroups(app.state).map(viewBagGroup).join('')}</div>
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

  Object.assign(app, {
    todayKicks, kickResult, bagTiming, viewToolMenu, viewKicksTool, viewContractionsTool, viewFoodTool,
    viewFoodResults, paintClocks, viewBag
  });
})();
