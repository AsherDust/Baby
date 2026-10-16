(function () {
  'use strict';
  // 睡前故事：故事页、首页晚上的卡片、工具目录里的那一格。朗读和按钮动作在 reader.js
  const { dates: D, stories: St, art: A, app } = globalThis.Baby;
  const { esc, ui, storyTexts } = app;

  const LANG_NAMES = { all: '中英文都有', zh: '只要中文', en: '只要英文' };
  const RATE_NAMES = [[0.75, '慢一点'], [0.9, '适中'], [1, '正常']];
  // 系统自带的搞怪声音（macOS 上的 Bells、Zarvox 之类），不适合睡前听
  const ODD_VOICES = /Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Junior|Ralph|Fred|Kathy|Grandma|Grandpa|Rocko|Shelley|Sandy|Flo|Eddy|Reed/;
  const NICE_VOICES = { zh: /Tingting|Ting-Ting|Lili|Yu-shu|Shasha|普通话|Mandarin/, en: /Samantha|Daniel|Karen|Moira|Serena|Arthur|Martha|UK English Female|US English/ };
  // 苹果设备上同一个声音可能同时有自带的标准版和下载的增强版、高级版，名字一样，只有 voiceURI 不同
  const QUALITY = [[/premium/i, '高级', 0.6], [/enhanced/i, '增强', 0.3]];
  const REGION = { 'zh-CN': '普通话', 'zh-TW': '台湾口音', 'zh-HK': '粤语', 'en-GB': '英式', 'en-US': '美式', 'en-AU': '澳洲', 'en-IE': '爱尔兰' };
  const voiceKey = (v) => v.voiceURI || v.name;
  const qualityOf = (v) => QUALITY.find(([re]) => re.test(v.voiceURI || '')) || [null, '', 0];

  const canSpeak = () => 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
  const multiline = (s) => esc(s).replace(/\n/g, '<br>');
  const isSubhead = (p) => /^【.+】$/.test(p);

  /**
   * 这台设备上能读这种语言的声音，好听的、普通话的排前面。
   * iPhone 的 Safari 会把同一个声音列两遍，voiceURI 也一样，朗读时按它找声音，只留一个
   */
  function voicesFor(lang) {
    if (!canSpeak()) return [];
    const want = lang === 'zh' ? /^(zh|cmn)/i : /^en/i;
    const main = lang === 'zh' ? /CN|Hans/i : /GB|US/i;
    const rank = (v) => (NICE_VOICES[lang].test(v.name) ? 0 : 4) + (main.test(v.lang) ? 0 : 2) + (v.localService ? 0 : 1) - qualityOf(v)[2];
    const seen = new Set();
    return window.speechSynthesis.getVoices()
      .filter((v) => want.test(v.lang) && !ODD_VOICES.test(v.name))
      .sort((a, b) => rank(a) - rank(b))
      .filter((v) => !seen.has(voiceKey(v)) && seen.add(voiceKey(v)));
  }

  /** 选过的声音；没选过或这台设备没有就用排第一的。以前存的是声音名字，也认 */
  function voiceFor(lang) {
    const list = voicesFor(lang);
    const saved = app.state.stories.voices[lang];
    return list.find((v) => voiceKey(v) === saved) || list.find((v) => v.name === saved) || list[0] || null;
  }

  /** 下拉框里的名字：标上增强版、口音；还分不出来的加个序号 */
  function voiceLabels(list) {
    const count = {};
    return list.map((v) => {
      const quality = qualityOf(v)[1];
      const label = `${v.name}${quality ? `（${quality}）` : ''} · ${REGION[v.lang.replace('_', '-')] || v.lang}`;
      count[label] = (count[label] || 0) + 1;
      return count[label] > 1 ? `${label} ${count[label]}` : label;
    });
  }

  /** 这一晚和今晚的故事；故事目录没加载出来时返回 null */
  function storyNight(now) {
    const index = globalThis.Baby.storyIndex;
    if (!index || !app.state) return null;
    const night = St.nightOf(ui.today, new Date(now).getHours());
    return { index, night, story: St.tonight(index, app.state.stories, night) };
  }

  /** 单篇自带作者的是几位作者的合集（散文与诗），合集名是自己起的，不写 */
  function storyMeta(info) {
    const c = info.collection;
    const book = info.story.author ? '' : c.lang === 'zh' ? `《${c.title}》` : c.title;
    return [info.author, book, info.position, `约 ${info.story.min} 分钟`].filter(Boolean).map(esc).join(' · ');
  }

  // ---------- 工具目录、首页 ----------

  function storyStatus(now) {
    const ctx = storyNight(now);
    if (!ctx || !ctx.story) return { text: '每晚一篇，可以朗读' };
    if (ui.reading && ui.reading.playing) return { live: true, text: `正在朗读 · ${esc(ctx.story.title)}` };
    return { text: `今晚：${esc(ctx.story.title)} · 约 ${ctx.story.min} 分钟` };
  }

  /** 晚上 7 点到凌晨 4 点，首页出现今晚的故事和飞鸟集里的一句 */
  function viewStoryCard(now) {
    if (!St.isEvening(new Date(now).getHours())) return '';
    const ctx = storyNight(now);
    if (!ctx || !ctx.story) return '';
    const { index, night, story } = ctx;
    const info = St.info(index, story);
    const read = app.state.stories.done[story.id] === night;
    const bird = St.birdOf(index, night);
    return `
      <a class="panel panel-story" href="#/tools/story">
        <span class="story-card-moon">${A.icon.moon}</span>
        <p class="eyebrow">今晚的睡前故事</p>
        <p class="story-card-title" lang="${info.collection.lang === 'en' ? 'en' : 'zh-CN'}">${esc(story.title)}</p>
        <p class="story-card-meta">${storyMeta(info)}${read ? ' · 今晚读过了' : ''}</p>
        ${bird ? `<blockquote class="story-bird"><p>${multiline(bird)}</p><cite>泰戈尔《飞鸟集》，郑振铎 译</cite></blockquote>` : ''}
        <span class="story-card-go">${read ? '再听一遍' : '去听故事'}${A.icon.chevronRight}</span>
      </a>`;
  }

  // ---------- 故事页 ----------

  function viewStoryTool(now) {
    const ctx = storyNight(now);
    if (!ctx) return '<div class="empty empty-compact"><p>故事目录没加载出来，刷新一下试试。</p></div>';
    const { index, night, story } = ctx;
    const st = app.state.stories;
    if (!story) {
      return `
        <div class="empty empty-compact">
          <span class="empty-icon">${A.icon.moon}</span>
          <p>能挑的故事都被隐藏了。可以在下面「全部故事」里恢复几篇，或者把推荐改成中英文都有。</p>
        </div>
        ${viewShelf(index, st, null)}
        ${viewStorySettings(st, null)}`;
    }
    const info = St.info(index, story);
    const lang = info.collection.lang;
    const box = storyTexts[story.c];
    const paras = box && box.status === 'ready' ? box.data[story.id] || null : null;
    const reading = ui.reading && ui.reading.id === story.id ? ui.reading : null;
    return `
      <section class="panel story-head">
        <p class="eyebrow">今晚的故事 · ${D.formatDate(night)}</p>
        <h2 class="story-title" lang="${lang === 'en' ? 'en' : 'zh-CN'}">${esc(story.title)}</h2>
        <p class="story-meta">${storyMeta(info)}</p>
        <div class="btn-row story-actions">
          ${viewPlayButton(paras, reading)}
          <button type="button" class="btn btn-ghost" data-action="story-swap">${A.icon.shuffle}换一个</button>
          <button type="button" class="btn btn-ghost" data-action="story-fav" aria-pressed="${st.favorites.includes(story.id)}">${A.icon.heart}${st.favorites.includes(story.id) ? '已收藏' : '收藏'}</button>
          <button type="button" class="btn btn-ghost" data-action="story-big" aria-pressed="${st.big}">${A.icon.textSize}大字</button>
        </div>
        ${canSpeak() ? '' : '<p class="hint story-hint">这个浏览器不能朗读，可以自己读给宝宝听。</p>'}
      </section>
      <article class="panel story-text${st.big ? ' is-big' : ''}${story.form === 'poem' ? ' is-poem' : ''}" lang="${lang === 'en' ? 'en' : 'zh-CN'}">
        ${paras ? viewParagraphs(paras, reading) : viewWaiting(box)}
        ${paras ? viewStoryEnd(info, night) : ''}
      </article>
      ${reading ? viewPlayer(reading) : ''}
      ${viewShelf(index, st, story)}
      ${viewStorySettings(st, story)}`;
  }

  function viewPlayButton(paras, reading) {
    if (!canSpeak()) return '';
    if (reading && reading.playing) return `<button type="button" class="btn" data-action="story-pause">${A.icon.pause}暂停</button>`;
    return `<button type="button" class="btn" data-action="story-play"${paras ? '' : ' disabled'}>${A.icon.play}${reading ? '继续' : '朗读'}</button>`;
  }

  /** 朗读时点哪段就从哪段读 */
  function viewParagraphs(paras, reading) {
    return paras.map((p, i) => {
      const cls = `story-p${isSubhead(p) ? ' story-sub' : ''}${reading && reading.index === i ? ' is-reading' : ''}`;
      const text = isSubhead(p) ? esc(p.slice(1, -1)) : multiline(p);
      return `<p class="${cls}" data-i="${i}"${reading ? ' data-action="story-from"' : ''}>${text}</p>`;
    }).join('');
  }

  function viewWaiting(box) {
    if (box && box.status === 'error') {
      return `
        <div class="story-wait">
          <p>正文没下载下来，可能是没联网。联网打开过一次的故事，以后不联网也能看。</p>
          <button type="button" class="btn btn-ghost btn-sm" data-action="story-retry">再试一次</button>
        </div>`;
    }
    return '<div class="story-wait"><p>正在翻开书……</p></div>';
  }

  function viewStoryEnd(info, night) {
    const { story, collection: c } = info;
    const readOn = app.state.stories.done[story.id];
    const serial = c.kind === 'serial';
    return `
      <footer class="story-end">
        ${readOn
          ? `<p class="story-done">${A.icon.check}${readOn === night ? '今晚读完了，晚安' : `${D.formatDate(readOn)} 读过`}</p>`
          : `<button type="button" class="btn" data-action="story-done">${A.icon.moon}读完了，晚安</button>`}
        <p class="story-source">出自<a class="link" href="${esc(info.url)}" target="_blank" rel="noopener">${esc(c.source)}</a>，作品已进入公有领域。</p>
        <p class="story-more"><button type="button" class="link" data-action="story-block" data-target="${esc(serial ? c.id : story.id)}">${serial ? '不想再看这部了' : '不想再看到这篇'}</button></p>
      </footer>`;
  }

  function viewPlayer(reading) {
    return `
      <div class="story-player" role="group" aria-label="朗读">
        <span class="story-player-text">${A.icon.moon}${reading.playing ? '正在朗读' : '暂停了'} · 第 <b class="story-player-pos">${reading.index + 1}</b> / ${reading.total} 段</span>
        ${reading.playing
          ? `<button type="button" class="icon-btn" data-action="story-pause" aria-label="暂停" title="暂停">${A.icon.pause}</button>`
          : `<button type="button" class="icon-btn" data-action="story-play" aria-label="继续" title="继续">${A.icon.play}</button>`}
        <button type="button" class="icon-btn" data-action="story-stop" aria-label="停止" title="停止">${A.icon.stop}</button>
      </div>`;
  }

  function viewShelf(index, st, current) {
    const favorites = st.favorites.map((id) => St.find(index, id)).filter(Boolean);
    const item = (s, { read = false, blocked = false } = {}) => `
      <li class="shelf-row${blocked ? ' is-hidden' : ''}">
        ${blocked
          ? `<span class="shelf-item"><span class="shelf-title">${esc(s.title)}</span><span class="shelf-meta">已隐藏</span></span>
             <button type="button" class="link" data-action="story-unblock" data-target="${esc(s.id)}">恢复</button>`
          : `<button type="button" class="shelf-item" data-action="story-pick" data-id="${esc(s.id)}"${current && current.id === s.id ? ' aria-current="true"' : ''}>
               <span class="shelf-title" title="${esc(s.title)}">${esc(s.title)}</span>
               <span class="shelf-meta">${read ? `${A.icon.check}读过 · ` : ''}${s.min} 分钟</span>
             </button>`}
      </li>`;
    const group = ({ collection: c, blocked, next, stories }) => {
      let note = `${stories.length} 篇`;
      if (c.kind === 'serial') note = !stories.some((x) => x.read) ? `连载 ${stories.length} 章` : next ? `读到第 ${next.n}/${stories.length} 章` : '读完了';
      return `
        <section class="shelf-group" lang="${c.lang === 'en' ? 'en' : 'zh-CN'}">
          <h3 class="shelf-head">${esc(c.title)}<small>${esc([c.author, note].filter(Boolean).join(' · '))}</small></h3>
          ${blocked
            ? `<p class="shelf-hidden">整部隐藏了 <button type="button" class="link" data-action="story-unblock" data-target="${esc(c.id)}">恢复</button></p>`
            : `<ul class="shelf-list">${stories.map((x) => item(x.story, x)).join('')}</ul>`}
        </section>`;
    };
    return `
      <details class="panel story-shelf" id="story-shelf"${ui.storyShelf ? ' open' : ''}>
        <summary>全部故事<small>${index.stories.length} 篇，点一篇换成今晚读</small></summary>
        ${favorites.length ? `
          <section class="shelf-group">
            <h3 class="shelf-head">收藏<small>${favorites.length} 篇</small></h3>
            <ul class="shelf-list">${favorites.map((s) => item(s, { read: Boolean(st.done[s.id]) })).join('')}</ul>
          </section>` : ''}
        ${St.catalog(index, st).map(group).join('')}
      </details>`;
  }

  function viewStorySettings(st, story) {
    const chip = (action, key, value, label, on) =>
      `<button type="button" class="chip" data-action="${action}" data-${key}="${value}" aria-pressed="${on}">${label}</button>`;
    const voiceSelect = (lang, label) => {
      const list = voicesFor(lang);
      if (list.length < 2) return '';
      const chosen = voiceFor(lang);
      const labels = voiceLabels(list);
      return `
        <label class="story-setting">
          <span>${label}</span>
          <select class="story-voice" data-lang="${lang}">
            ${list.map((v, i) => `<option value="${esc(voiceKey(v))}"${v === chosen ? ' selected' : ''}>${esc(labels[i])}</option>`).join('')}
          </select>
        </label>`;
    };
    const langs = st.lang === 'all' ? ['zh', 'en'] : [st.lang];
    if (story) {
      const lang = globalThis.Baby.storyIndex.collections.find((c) => c.id === story.c).lang;
      if (!langs.includes(lang)) langs.push(lang);
    }
    return `
      <section class="panel story-settings">
        <p class="eyebrow">设置</p>
        <div class="story-setting">
          <span>每晚推荐</span>
          <div class="food-levels" role="group" aria-label="每晚推荐">${Object.entries(LANG_NAMES).map(([id, name]) => chip('story-lang', 'lang', id, name, st.lang === id)).join('')}</div>
        </div>
        ${canSpeak() ? `
          <div class="story-setting">
            <span>朗读语速</span>
            <div class="food-levels" role="group" aria-label="朗读语速">${RATE_NAMES.map(([rate, name]) => chip('story-rate', 'rate', rate, name, st.rate === rate)).join('')}</div>
          </div>
          ${langs.includes('zh') ? voiceSelect('zh', '中文声音') : ''}
          ${langs.includes('en') ? voiceSelect('en', '英文声音') : ''}
          <p class="fineprint">朗读用的是手机自带的语音，读的时候屏幕保持常亮；锁屏或切到别的 App 可能会停，回来点「继续」接着读。iPhone 可以在「设置 → 辅助功能 → 朗读内容 → 声音」里下载更自然的声音。</p>` : ''}
      </section>`;
  }

  Object.assign(app, { canSpeak, voicesFor, voiceFor, storyNight, storyStatus, viewStoryCard, viewStoryTool });
})();
