(function () {
  'use strict';
  // 「宝宝」页的日常（记一笔、当天小结、存奶、最近 7 天）和宝宝出生后的首页；孕晚期首页上「宝宝出生了吗」那块也在这里。
  // 成长、疫苗、体检、健康、辅食几页在 baby-pages.js
  const { dates: D, baby: Bb, babyBook: BOOK, babyFood: FOOD, recipeBook: RB, chart: Chart, art: A, app } = globalThis.Baby;
  const { esc, ui, hhmm, TERM_FROM, todoMood, todoMoodCare, todoMeal, recipeDot } = app;

  const LEVEL_NAMES = { cool: '偏低', normal: '正常', low: '低热', mid: '中等发热', high: '高热' };
  const siteName = Object.fromEntries(BOOK.feverSites.map(([id, name]) => [id, name]));
  const colorOf = (id) => BOOK.pooColors.find((c) => c[0] === id) || null;
  const foodColors = { ...RB.colors, ...FOOD.colors };
  const foodDot = (r) => recipeDot(r, foodColors);

  const kid = () => app.state.baby;
  const who = () => esc(kid().name || app.state.profile.nickname || '宝宝');
  const ageNow = () => Bb.ageOf(kid().birthDate, ui.today);
  const sexName = (b) => (b.sex === 'boy' ? '男宝' : '女宝');

  /** 按最近的间隔估一下下次喂奶；只是参考 */
  function viewNextFeed(now) {
    const n = Bb.nextFeed(kid(), now);
    if (!n) return '';
    return `
      <p class="next-feed">${n.due ? '按最近的间隔，<b>差不多该饿了</b>' : `下次大约 <b>${hhmm(n.at)}</b>`}
        <small>最近大约 ${minText(n.gap)}喂一次，饿了就喂</small>
      </p>`;
  }

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
        const level = Bb.tempOf(BOOK, kid(), l);
        return { icon: A.icon.thermo, name: '体温', text: `${l.value}℃ · ${siteName[l.site]} · ${LEVEL_NAMES[level]}`, warn: level !== 'normal' };
      }
      case 'pump':
        return { icon: A.icon.drop, name: '吸奶', text: `${[l.left ? `左 ${l.left}` : '', l.right ? `右 ${l.right}` : ''].filter(Boolean).join(' · ')} · 一共 ${l.left + l.right} 毫升` };
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
        <button type="button" class="chip" id="log-pump" data-action="baby-log" data-type="pump">${A.icon.drop}吸奶</button>
        <button type="button" class="chip" id="log-food" data-action="baby-log" data-type="food">${A.icon.bowl}辅食</button>
        <button type="button" class="chip" id="log-temp" data-action="baby-log" data-type="temp">${A.icon.thermo}体温</button>
        <button type="button" class="chip" id="log-med" data-action="baby-log" data-type="med">${A.icon.pill}用药</button>
        <button type="button" class="chip" id="log-breast" data-action="baby-log" data-type="breast">补记亲喂</button>
        <button type="button" class="chip" id="log-sleep" data-action="baby-log" data-type="sleep">补记睡觉</button>
      </div>`;
  }

  function viewSummary(s) {
    const feed = [s.breastMin ? `亲喂 ${minText(s.breastMin)}` : '', s.bottleMl ? `瓶喂 ${s.bottleMl} 毫升` : '', s.pumpMl ? `吸奶 ${s.pumpMl} 毫升` : ''].filter(Boolean).join(' · ');
    return `
      <ul class="bsum">
        <li><span class="bsum-name">喂奶</span><b>${s.feeds}<small>次</small></b><span class="bsum-sub">${feed || '还没记'}</span></li>
        <li><span class="bsum-name">睡觉</span><b>${s.sleepMin >= 60 ? `${Math.floor(s.sleepMin / 60)}<small>小时</small>${s.sleepMin % 60 ? `${s.sleepMin % 60}<small>分</small>` : ''}` : `${s.sleepMin}<small>分钟</small>`}</b><span class="bsum-sub">${s.sleepMin ? '包括还在睡的' : '还没记'}</span></li>
        <li><span class="bsum-name">尿布</span><b>${s.diapers}<small>次</small></b><span class="bsum-sub">${s.diapers ? `尿 ${s.pee} · 便 ${s.poo}` : '还没记'}</span></li>
      </ul>`;
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
        ${isToday && s.lastFeed ? `<p class="last-feed">上次喂奶：<b>${agoText(s.lastFeed, now)}</b></p>${viewNextFeed(now)}` : ''}
        ${isToday ? viewQuick() : ''}
      </article>
      <article class="card baby-tl" aria-label="${label}的记录">
        <header class="card-head">
          <h2 class="card-title">${A.icon.notes}${label}的记录</h2>
          <button type="button" class="btn btn-ghost btn-sm" id="log-more" data-action="baby-log" data-type="diaper" data-date="${date}">${A.icon.plus}补一条</button>
        </header>
        ${s.logs.length ? `<ul class="blog-list">${s.logs.map((l) => viewLogRow(l, now)).join('')}</ul>` : `<p class="food-empty">${isToday ? '点上面的按钮，一下就记好' : '这天没有记录'}</p>`}
      </article>
      ${isToday ? viewStash(now) : ''}
      ${isToday ? viewTrend(now) : ''}
      <p class="fineprint">${feedingTip()}</p>`;
  }

  const placeName = Object.fromEntries(Bb.STASH_PLACES.map((p) => [p.id, p.name]));

  /** 这袋还能放多久：过期了 / 今天 21:00 前用完 / 还能放 5 天 */
  function stashLeft(r, now) {
    if (r.status === 'expired') return '过期了，倒掉吧';
    if (r.left < 2 * 86400000) return `${whenText(r.until, now)}前用完`;
    return `还能放 ${Math.floor(r.left / 86400000)} 天，${D.formatDate(Bb.dayOf(r.until))}前用完`;
  }

  /** 「存奶」：冰箱里的一袋袋母乳，先吸的在前；吸过奶或者存过才显示 */
  function viewStash(now) {
    const b = kid();
    if (!b.stash.length && !b.logs.some((l) => l.type === 'pump')) return '';
    const rows = Bb.stashRows(b, now);
    const sum = (kind) => rows.filter((r) => (kind === 'fridge' ? r.kind !== 'freezer' : r.kind === 'freezer'));
    const meta = rows.length ? ['fridge', 'freezer'].map((k) => {
      const list = sum(k);
      return list.length ? `${placeName[k]} ${list.length} 袋 ${list.reduce((n, r) => n + r.ml, 0)} 毫升` : '';
    }).filter(Boolean).join(' · ') : '冰箱里还没有存奶';
    return `
      <article class="card baby-stash">
        <header class="card-head"><div><h2 class="card-title">${A.icon.drop}存奶</h2><p class="card-meta">${meta}</p></div></header>
        ${rows.length ? `<ul class="stash-list">${rows.map((r) => `
          <li class="stash stash-${r.status}">
            <span class="stash-ml"><b>${r.ml}</b><small>毫升</small></span>
            <div class="stash-main">
              <p class="stash-title">${r.kind === 'thawed' ? '解冻中' : placeName[r.kind]} · ${D.diffDays(Bb.dayOf(r.at), Bb.dayOf(now)) <= 1 ? whenText(r.at, now) : D.formatDate(Bb.dayOf(r.at))} 吸的</p>
              <p class="stash-left">${stashLeft(r, now)}</p>
            </div>
            <div class="stash-actions">
              ${r.status === 'expired' ? '' : `<button type="button" class="chip" id="stash-use-${r.id}" data-action="stash-use" data-id="${r.id}">用掉</button>`}
              ${r.kind === 'freezer' && r.status !== 'expired' ? `<button type="button" class="chip" id="stash-thaw-${r.id}" data-action="stash-thaw" data-id="${r.id}">解冻</button>` : ''}
              <button type="button" class="icon-btn icon-btn-sm" id="stash-drop-${r.id}" data-action="stash-drop" data-id="${r.id}" aria-label="倒掉这袋 ${r.ml} 毫升" title="倒掉">${A.icon.x}</button>
            </div>
          </li>`).join('')}</ul>` : ''}
        <form class="stash-form" data-form="stash-add" novalidate>
          <input id="stash-ml" name="ml" inputmode="numeric" autocomplete="off" placeholder="毫升" aria-label="这袋多少毫升" data-keep>
          <div class="seg" role="radiogroup" aria-label="放哪">${Bb.STASH_PLACES.map((p, i) => `<label><input type="radio" name="place" value="${p.id}"${i ? '' : ' checked'}><span>${p.name}</span></label>`).join('')}</div>
          <button class="btn btn-sm">存一袋</button>
          <p class="form-error" hidden></p>
        </form>
        <p class="fineprint">按中国疾控中心的建议：冷藏（4℃）不超过 2 天，冷冻（-18℃ 以下）不超过 3 个月；冷冻的放冷藏室解冻，解冻后 24 小时内用完，不能再冻。喝剩的不留，不用微波炉热。点「用掉」会记成一次母乳瓶喂。</p>
      </article>`;
  }

  const TRENDS = [['sleep', '睡眠', '小时'], ['feeds', '喂奶', '次'], ['diapers', '尿布', '片']];
  const trendMetric = () => (TRENDS.some(([id]) => id === ui.trendMetric) ? ui.trendMetric : 'sleep');

  // 这次重画算好的最近 7 天，画图（重画后、窗口变了大小）时直接用
  let trendWeek = null;

  /** 「最近 7 天」：每天睡了多久、喂了几次、换了几片尿布，图在 drawTrend 里画 */
  function viewTrend(now) {
    trendWeek = Bb.weekSummary(kid(), ui.today, now);
    const all = trendWeek.filter((d) => d.has);
    // 今天还没过完，有前几天的就只算前几天
    const past = all.filter((d) => d.date !== ui.today);
    const days = past.length ? past : all;
    const span = past.length ? `前 ${past.length} 天` : '今天到现在';
    const metric = trendMetric();
    const avg = (f) => days.reduce((s, d) => s + f(d), 0) / days.length;
    const age = ageNow();
    let note;
    if (!days.length) {
      note = '记上几天，这里就能看出每天睡了多久、喂了几次、换了几片尿布。';
    } else if (metric === 'sleep') {
      const mins = Math.round(avg((d) => d.sleepMin));
      const need = Bb.sleepNeed(age.months);
      const where = need ? (mins < need[0] * 60 ? '，比一般少一些' : mins > need[1] * 60 ? '，比一般多一些' : '，在一般的范围里') : '';
      note = `${span}平均每天睡 <b>${minText(mins)}</b>${where}。${need ? `${age.months < 4 ? '4 个月以下' : Bb.ageText({ ...age, rest: 0 })}的宝宝一般每天睡 ${need[0]}～${need[1]} 小时（含白天小睡），图上浅绿色的就是这个范围。` : ''}`;
    } else if (metric === 'feeds') {
      const breast = Math.round(avg((d) => d.breastMin));
      const ml = Math.round(avg((d) => d.bottleMl));
      note = `${span}平均每天喂 <b>${Math.round(avg((d) => d.feeds) * 10) / 10}</b> 次${breast ? `，亲喂一共 ${minText(breast)}` : ''}${ml ? `，瓶喂一共 ${ml} 毫升` : ''}。按需喂就好，每个宝宝的节奏不一样。`;
    } else {
      const pee = Math.round(avg((d) => d.pee) * 10) / 10;
      note = `${span}平均每天换 <b>${Math.round(avg((d) => d.diapers) * 10) / 10}</b> 片，其中有尿的 ${pee} 片、有便便的 ${Math.round(avg((d) => d.poo) * 10) / 10} 片。${age.days >= 7 && age.months < 6 ? '出生一周后，吃够奶的宝宝一般每天有 6 片以上湿的尿布。' : ''}`;
    }
    return `
      <article class="card baby-trend">
        <header class="card-head"><h2 class="card-title">${A.icon.bars}最近 7 天</h2></header>
        <div class="recipe-chips" role="group" aria-label="看哪一项">
          ${TRENDS.map(([id, name, unit]) => `<button type="button" class="chip" id="trend-${id}" data-action="trend-metric" data-metric="${id}" aria-pressed="${metric === id}">${name}<small>${unit}</small></button>`).join('')}
        </div>
        <div class="chart chart-trend" id="trend-chart"></div>
        <p class="trend-note">${note}${days.length ? `只算记下来的，没记全的那几天会偏少${past.length ? '；今天还没过完，不算进平均' : ''}。` : ''}</p>
      </article>`;
  }

  function drawTrend() {
    const box = document.getElementById('trend-chart');
    if (!box || !app.state || !kid()) return;
    const metric = trendMetric();
    const bars = (trendWeek || Bb.weekSummary(kid(), ui.today, Date.now())).map((d) => {
      const today = d.date === ui.today;
      const label = today ? '今天' : `周${D.weekday(d.date)}`;
      const value = metric === 'sleep' ? Math.round(d.sleepMin / 6) / 10 : metric === 'feeds' ? d.feeds : d.diapers;
      return { label, value, text: String(value), today };
    });
    const [, name, unit] = TRENDS.find(([id]) => id === metric);
    const width = Math.max(260, Math.round(box.clientWidth));
    box.innerHTML = Chart.bars({
      bars,
      band: metric === 'sleep' ? Bb.sleepNeed(ageNow().months) : null,
      width,
      height: width < 420 ? 190 : 220,
      label: `最近 7 天每天的${name}（${unit}）`,
    });
  }

  function examWhen(r) {
    if (r.booked) return `约在 ${D.formatDate(r.booked, { weekday: true, relativeTo: ui.today })}`;
    if (r.status === 'due') return `现在可以去了，${D.formatDate(r.to, { relativeTo: ui.today })}前`;
    return `${D.formatDate(r.from, { relativeTo: ui.today })}起可以去`;
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

  /** 今天、明天约了疫苗或体检的，挂在首页最上面 */
  function viewBabyBanner() {
    const list = Bb.vaccineReminders(Bb.vaccineRows(kid(), BOOK, ui.today), ui.today);
    const exams = Bb.examReminders(Bb.examRows(kid(), BOOK, ui.today), ui.today);
    if (!list.length && !exams.length) return '';
    return `
      <section class="banner" role="status">
        <span class="banner-bee">${A.bee}</span>
        <div class="banner-list">
          ${exams.map((r) => {
            const day = r.booked === ui.today ? '今天' : '明天';
            return `
              <div class="banner-item">
                <div>
                  <p class="banner-title">${day}体检：${r.name}</p>
                  <p class="banner-text">${r.where}${r.who === 'both' ? '' : '；带上儿童保健手册和预防接种证'}。</p>
                </div>
                ${day === '今天' ? `<button type="button" class="btn btn-sm" data-action="exam-done" data-id="${r.id}">做完了</button>` : ''}
              </div>`;
          }).join('')}
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
          ${s.lastFeed ? `<p class="last-feed">上次喂奶：<b>${agoText(s.lastFeed, now)}</b></p>${viewNextFeed(now)}` : ''}
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
    const vitD = Bb.dayLogs(b, ui.today).some((l) => l.type === 'med' && /维生素\s*A?D|维\s*A?D|AD\s*滴/i.test(l.name));
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
    const stash = Bb.stashRows(b, now).filter((r) => r.status !== 'ok');
    if (stash.length) {
      const expired = stash.filter((r) => r.status === 'expired');
      const first = stash.find((r) => r.status === 'soon');
      items.push(todoItem({
        icon: A.icon.drop,
        alert: expired.length > 0,
        title: expired.length ? `存奶：${expired.length} 袋过期了` : `存奶：${stash.length} 袋快到期了`,
        text: `${expired.length ? '过期的倒掉吧' : `${placeName[first.kind] || '解冻的'} ${first.ml} 毫升，${whenText(first.until, now)}前用完`} · <a class="link" href="#/baby">去看看</a>`,
      }));
    }
    const exams = Bb.examRows(b, BOOK, ui.today);
    const lateExams = exams.filter((r) => r.status === 'late');
    const nextExam = Bb.nextExam(exams);
    if (lateExams.length) {
      items.push(todoItem({ icon: A.icon.calendarHeart, title: `有 ${lateExams.length} 次体检过了时间、没记做过`, text: `${lateExams.slice(0, 2).map((r) => r.name).join('、')} · <a class="link" href="#/baby/exams">去看看</a>` }));
    } else if (nextExam && (nextExam.booked || nextExam.status === 'due' || nextExam.status === 'soon')) {
      items.push(todoItem({ icon: A.icon.calendarHeart, title: `下一次体检：${nextExam.name}`, text: `${examWhen(nextExam)} · <a class="link" href="#/baby/exams">体检</a>` }));
    }
    if (age.months < 3) {
      const papers = Bb.paperRows(b, BOOK, ui.today);
      const left = papers.filter((r) => !r.done).length;
      const pick = papers.find((r) => r.status === 'late' || r.status === 'soon') || Bb.nextPaper(papers);
      if (left) items.push(todoItem({ icon: A.icon.docCheck, title: `出生后要办的事 ${papers.length - left}/${papers.length}`, text: `下一件：${pick.name}${pick.by ? `，最好 ${D.formatDate(pick.by)}前办` : ''} · <a class="link" href="#/tools/papers">办证清单</a>` }));
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
    items.push(todoMoodCare(ui.today));
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

  Object.assign(app, {
    viewBornCard, viewBabyBanner, viewBabyHero, babyLive, drawTrend, babyMinText: minText, babyLogInfo: logInfo, babyFoodDot: foodDot,
    // baby-pages.js 里的几页也要用
    babyAgeNow: ageNow, babyWho: who, babySexName: sexName, babyWhenText: whenText, babyLevelNames: LEVEL_NAMES, babySiteName: siteName,
    babyExamWhen: examWhen, viewBabyLogRow: viewLogRow, viewBabyDaily: viewDaily
  });
})();
