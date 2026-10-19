(function () {
  'use strict';
  // 睡前故事：每晚挑一篇。目录在 data/stories/index.js，正文按部放在同目录的 <部>.json 里，
  // 都由 scripts/build_stories.py 生成。这里只管挑哪篇和记住读过什么，不碰页面
  const Baby = globalThis.Baby || (globalThis.Baby = {});
  const D = Baby.dates;

  // 19 点起首页出现今晚的故事；凌晨 4 点前还算前一天晚上
  const EVENING_FROM = 19;
  const NIGHT_ENDS = 4;
  const LANGS = ['all', 'zh', 'en'];
  const RATES = [0.75, 0.9, 1];
  const RATE_DEFAULT = 0.9;
  const LIST_MAX = 300;
  const ID = /^[a-z0-9]{1,20}(-\d{1,3})?$/;

  const isId = (v) => typeof v === 'string' && ID.test(v);
  const idList = (list) => [...new Set(Array.isArray(list) ? list.filter(isId) : [])].slice(-LIST_MAX);
  const voiceName = (v) => (typeof v === 'string' ? v.slice(0, 120) : '');

  function empty() {
    return { tonight: null, done: {}, favorites: [], blocked: [], lang: 'all', rate: RATE_DEFAULT, voices: { zh: '', en: '' }, big: false };
  }

  function normalize(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const t = r.tonight;
    const done = {};
    if (r.done && typeof r.done === 'object') {
      for (const [id, date] of Object.entries(r.done)) if (isId(id) && D.isISODate(date)) done[id] = date;
    }
    const voices = r.voices && typeof r.voices === 'object' ? r.voices : {};
    return {
      tonight: t && D.isISODate(t.date) && isId(t.id) ? { date: t.date, id: t.id, passed: idList(t.passed) } : null,
      done,
      favorites: idList(r.favorites),
      blocked: idList(r.blocked),
      lang: LANGS.includes(r.lang) ? r.lang : 'all',
      rate: RATES.includes(r.rate) ? r.rate : RATE_DEFAULT,
      voices: { zh: voiceName(voices.zh), en: voiceName(voices.en) },
      big: r.big === true,
    };
  }

  const isEvening = (hour) => hour >= EVENING_FROM || hour < NIGHT_ENDS;
  /** 这一晚记在哪天名下 */
  const nightOf = (today, hour) => (hour < NIGHT_ENDS ? D.addDays(today, -1) : today);

  /** 同一个字符串总得到同一个数，用来按日期「随机」挑 */
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  const find = (index, id) => index.stories.find((s) => s.id === id) || null;
  const collectionOf = (index, story) => index.collections.find((c) => c.id === story.c) || null;
  const storiesIn = (index, cid) => index.stories.filter((s) => s.c === cid);
  const isBlocked = (st, story) => st.blocked.includes(story.id) || st.blocked.includes(story.c);

  /** 连载的下一章；读完了返回 null。单独挡掉的章节跳过 */
  const serialNext = (index, st, cid) => storiesIn(index, cid).find((s) => !st.done[s.id] && !st.blocked.includes(s.id)) || null;
  const started = (index, st, cid) => storiesIn(index, cid).some((s) => st.done[s.id]);
  const lastRead = (index, st, cid) => storiesIn(index, cid).reduce((m, s) => (st.done[s.id] > m ? st.done[s.id] : m), '');

  /** 每部出一篇候选：连载是下一章，散篇挑没读过的（都读过就挑最久没读的那一半） */
  function candidates(index, st, date, skip) {
    const out = [];
    for (const c of index.collections) {
      if (st.blocked.includes(c.id) || (st.lang !== 'all' && c.lang !== st.lang)) continue;
      if (c.kind === 'serial') {
        // 续集等前一部读完（或挡掉）再出；自己从目录翻开过的照常接着读
        const before = c.after && !st.blocked.includes(c.after) && serialNext(index, st, c.after);
        if (before && !started(index, st, c.id)) continue;
        const next = serialNext(index, st, c.id);
        if (next && !skip.has(next.id)) out.push({ story: next, lang: c.lang, going: started(index, st, c.id) ? lastRead(index, st, c.id) : '' });
        continue;
      }
      const open = storiesIn(index, c.id).filter((s) => !isBlocked(st, s) && !skip.has(s.id));
      const unread = open.filter((s) => !st.done[s.id]);
      const pool = unread.length ? unread
        : open.sort((a, b) => (st.done[a.id] < st.done[b.id] ? -1 : 1)).slice(0, Math.ceil(open.length / 2));
      if (pool.length) out.push({ story: pool[hash(`${date}/${c.id}/${skip.size}`) % pool.length], lang: c.lang, going: '' });
    }
    return out;
  }

  /** 读到一半的连载优先接着读（最近在读的那部）；否则中文、英文各一半机会，再在这种语言里挑一部 */
  function choose(index, st, date, skip) {
    const list = candidates(index, st, date, skip);
    if (!list.length) return null;
    const going = list.filter((x) => x.going).sort((a, b) => (a.going < b.going ? 1 : a.going > b.going ? -1 : 0))[0];
    if (going) return going.story;
    const h = hash(`${date}#${skip.size}`);
    const langs = [...new Set(list.map((x) => x.lang))];
    const pool = list.filter((x) => x.lang === langs[h % langs.length]);
    return pool[Math.floor(h / langs.length) % pool.length].story;
  }

  const passedOn = (st, date) => (st.tonight && st.tonight.date === date ? st.tonight.passed : []);

  /** 这一晚的故事：换过、自己选过、读完的会固定下来；否则按日期挑，同一天怎么打开都是这篇 */
  function tonight(index, st, date) {
    const t = st.tonight;
    const pinned = t && t.date === date ? find(index, t.id) : null;
    if (pinned && !isBlocked(st, pinned)) return pinned;
    return choose(index, st, date, new Set(passedOn(st, date)));
  }

  function pin(st, date, id) {
    st.tonight = { date, id, passed: passedOn(st, date).slice() };
  }

  /** 换一篇。今晚换掉过的不再出现，全换过一轮后从头来；只剩这一篇时原样返回 */
  function swap(index, st, date) {
    const current = tonight(index, st, date);
    const passed = passedOn(st, date).slice();
    if (current && !passed.includes(current.id)) passed.push(current.id);
    let next = choose(index, st, date, new Set(passed));
    if (!next && current) {
      passed.splice(0, passed.length, current.id);
      next = choose(index, st, date, new Set(passed));
    }
    if (!next) return current;
    st.tonight = { date, id: next.id, passed: passed.slice(-LIST_MAX) };
    return next;
  }

  /** 从目录里自己挑一篇当今晚的 */
  function select(index, st, date, id) {
    const story = find(index, id);
    if (story) pin(st, date, id);
    return story;
  }

  /** 读完了：记下日期（连载下次就接着下一章），今晚仍停在这篇 */
  function markRead(st, date, id) {
    const before = st.done[id] || null;
    st.done[id] = date;
    pin(st, date, id);
    return before;
  }

  function unmarkRead(st, id, before) {
    if (before) st.done[id] = before;
    else delete st.done[id];
  }

  function toggleFavorite(st, id) {
    const i = st.favorites.indexOf(id);
    if (i >= 0) st.favorites.splice(i, 1);
    else st.favorites.push(id);
    return i < 0;
  }

  /** 不想再看到：一篇的 id 或整部的 id。挡掉的正好是今晚这篇时，tonight() 会自动换一篇 */
  function block(st, target) {
    if (!st.blocked.includes(target)) st.blocked.push(target);
  }

  function unblock(st, target) {
    st.blocked = st.blocked.filter((x) => x !== target);
  }

  /** 换语言后今晚这篇对不上就重新挑（自己从目录选的也一样） */
  function setLang(index, st, date, lang) {
    if (!LANGS.includes(lang)) return;
    st.lang = lang;
    const t = st.tonight;
    const story = t && t.date === date ? find(index, t.id) : null;
    if (story && lang !== 'all' && collectionOf(index, story).lang !== lang) st.tonight = null;
  }

  /** 飞鸟集每晚一句，按日期轮着来 */
  function birdOf(index, date) {
    const n = index.birds.length;
    return n ? index.birds[((D.diffDays('2026-01-01', date) % n) + n) % n] : '';
  }

  /** 页面要显示的：作者、出处、第几章 */
  function info(index, story) {
    const c = collectionOf(index, story);
    const count = storiesIn(index, c.id).length;
    return {
      story,
      collection: c,
      author: story.author || c.author,
      url: story.url || c.url,
      position: c.kind === 'serial' ? `第 ${story.n}/${count} 章` : '',
    };
  }

  function catalog(index, st) {
    return index.collections.map((c) => ({
      collection: c,
      blocked: st.blocked.includes(c.id),
      next: c.kind === 'serial' ? serialNext(index, st, c.id) : null,
      stories: storiesIn(index, c.id).map((s) => ({
        story: s,
        read: Boolean(st.done[s.id]),
        favorite: st.favorites.includes(s.id),
        blocked: st.blocked.includes(s.id),
      })),
    }));
  }

  Baby.stories = {
    EVENING_FROM,
    NIGHT_ENDS,
    RATES,
    empty,
    normalize,
    isEvening,
    nightOf,
    find,
    tonight,
    swap,
    select,
    markRead,
    unmarkRead,
    toggleFavorite,
    block,
    unblock,
    setLang,
    birdOf,
    info,
    catalog,
  };
})();
