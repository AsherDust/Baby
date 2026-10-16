(function () {
  'use strict';
  // 睡前故事：下载正文、朗读、故事页上的按钮
  const { stories: St, app } = globalThis.Baby;
  const { root, ui, storyTexts, afterRender, canSpeak, voiceFor, storyNight, render, currentRoute, toast, oops, persist } = app;

  // 段和段之间停一下；一次交给语音的字数有上限，太长时有的浏览器读到一半会自己停
  const PARA_GAP = 350;
  const CHUNK = 160;

  const index = () => globalThis.Baby.storyIndex;
  const night = () => St.nightOf(ui.today, new Date(Date.now()).getHours());
  const copyTonight = (t) => (t ? { ...t, passed: t.passed.slice() } : null);

  // ---------- 正文 ----------

  async function loadText(cid) {
    storyTexts[cid] = { status: 'loading' };
    try {
      const res = await fetch(`data/stories/${cid}.json`);
      if (!res.ok) throw new Error(String(res.status));
      storyTexts[cid] = { status: 'ready', data: await res.json() };
    } catch (e) {
      storyTexts[cid] = { status: 'error' };
    }
    render();
  }

  /** 在故事页时，今晚这篇所在的那部还没下载就去下载；下载失败的等点「再试一次」 */
  function ensureText() {
    if (!app.state || currentRoute().sub !== 'story') return;
    const ctx = storyNight(Date.now());
    if (ctx && ctx.story && !storyTexts[ctx.story.c]) loadText(ctx.story.c);
  }
  afterRender.push(ensureText);

  function currentText() {
    const ctx = storyNight(Date.now());
    const story = ctx && ctx.story;
    const box = story && storyTexts[story.c];
    const paras = box && box.status === 'ready' ? box.data[story.id] : null;
    return paras ? { ctx, story, paras } : null;
  }

  // ---------- 朗读 ----------
  // 一段一段读，读到哪段高亮哪段。暂停就是停下并记住是第几段，继续时从这段开头读：
  // 不少手机浏览器的 pause() / resume() 不可靠

  // 每次开始、暂停、停止都加一；旧的朗读回调发现对不上就不再往下读
  let run = 0;

  /** 按句子切成不太长的几块 */
  function chunks(text) {
    const out = [];
    for (const s of text.match(/[^。！？；!?;.]+[。！？；!?;.…]*[”’"')）]*\s*/g) || [text]) {
      if (out.length && (out[out.length - 1] + s).length <= CHUNK) out[out.length - 1] += s;
      else out.push(s);
    }
    return out.map((s) => s.trim()).filter(Boolean);
  }

  const visible = (el, bottomGap = 0) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight - bottomGap;
  };
  // 手机上底部有菜单和朗读条，挡住的部分不算看得见
  const BOTTOM_GAP = 150;

  /** 只换高亮的那段，不整页重绘。上一段还在屏幕上时跟着往下滚；自己滑走了就不打扰 */
  function highlight(i, force = false) {
    const pos = root.querySelector('.story-player-pos');
    if (pos) pos.textContent = String(i + 1);
    const prev = root.querySelector('.story-p.is-reading');
    const next = root.querySelector(`.story-p[data-i="${i}"]`);
    if (!next) return;
    const follow = force || !prev || prev.getBoundingClientRect().bottom > 0;
    if (prev !== next) {
      prev?.classList.remove('is-reading');
      next.classList.add('is-reading');
    }
    if (follow && !visible(next, BOTTOM_GAP)) next.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  /** 从第 index 段读起。第一句必须在点击里同步发出，iPhone 才肯出声 */
  function speakFrom(start) {
    const cur = currentText();
    if (!cur || !canSpeak()) return;
    const { ctx, story, paras } = cur;
    const synth = window.speechSynthesis;
    const id = ++run;
    synth.cancel();
    const lang = St.info(ctx.index, story).collection.lang;
    const voice = voiceFor(lang);
    const rate = app.state.stories.rate;
    ui.reading = { id: story.id, index: start, total: paras.length, playing: true };

    const say = (i, queue) => {
      if (id !== run) return;
      if (!queue.length) {
        if (i + 1 >= paras.length) finish(story, ctx.night);
        else setTimeout(() => para(i + 1), PARA_GAP);
        return;
      }
      const u = new window.SpeechSynthesisUtterance(queue[0]);
      u.lang = voice ? voice.lang : lang === 'zh' ? 'zh-CN' : 'en-GB';
      if (voice) u.voice = voice;
      u.rate = rate;
      u.onend = () => say(i, queue.slice(1));
      u.onerror = (e) => {
        if (id !== run || e.error === 'interrupted' || e.error === 'canceled') return;
        pauseReading();
        oops('朗读停住了，点「继续」接着读');
      };
      synth.speak(u);
    };
    const para = (i, force = false) => {
      if (id !== run) return;
      ui.reading.index = i;
      highlight(i, force);
      say(i, chunks(paras[i].replace(/^【(.+)】$/, '$1。')));
    };
    render();
    para(start, true);
  }

  function finish(story, date) {
    run += 1;
    ui.reading = null;
    St.markRead(app.state.stories, date, story.id);
    persist();
    render();
    toast('读完啦，晚安');
  }

  function pauseReading() {
    if (!ui.reading) return;
    run += 1;
    window.speechSynthesis.cancel();
    ui.reading.playing = false;
    render();
  }

  /** 停下并忘掉读到哪了；不重绘，调用的地方自己重绘 */
  function stopReading() {
    if (!ui.reading) return;
    run += 1;
    if (canSpeak()) window.speechSynthesis.cancel();
    ui.reading = null;
  }

  function setStoryVoice(lang, key) {
    app.state.stories.voices[lang] = String(key).slice(0, 120);
    persist();
    if (ui.reading && ui.reading.playing) speakFrom(ui.reading.index);
  }

  // 锁屏、切到别的 App 时系统会掐掉朗读，回来时改成「暂停了」，点一下接着读
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !ui.reading || !ui.reading.playing) return;
    setTimeout(() => {
      if (!ui.reading || !ui.reading.playing || window.speechSynthesis.speaking) return;
      run += 1;
      ui.reading.playing = false;
      render();
    }, 800);
  });

  // 有的浏览器打开页面后才慢慢列出可用的声音
  if (canSpeak() && window.speechSynthesis.addEventListener) {
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      if (app.state && currentRoute().sub === 'story' && !(ui.reading && ui.reading.playing)) render();
    });
  }

  // ---------- 按钮 ----------

  const storyActions = {
    'story-play'() {
      const cur = currentText();
      if (!cur) return;
      speakFrom(ui.reading && ui.reading.id === cur.story.id ? ui.reading.index : 0);
    },

    'story-pause'() {
      pauseReading();
    },

    'story-stop'() {
      stopReading();
      render();
    },

    'story-from'(el) {
      speakFrom(Number(el.dataset.i));
    },

    'story-swap'() {
      const st = app.state.stories;
      const before = copyTonight(st.tonight);
      const was = St.tonight(index(), st, night());
      const next = St.swap(index(), st, night());
      if (!next || (was && next.id === was.id)) return toast('没有别的故事可换了');
      stopReading();
      persist();
      render();
      window.scrollTo(0, 0);
      toast(`换成《${next.title}》`, () => {
        stopReading();
        st.tonight = before;
      });
    },

    'story-pick'(el) {
      const st = app.state.stories;
      const before = copyTonight(st.tonight);
      const story = St.select(index(), st, night(), el.dataset.id);
      if (!story) return;
      stopReading();
      ui.storyShelf = false;
      persist();
      render();
      window.scrollTo(0, 0);
      toast(`今晚读《${story.title}》`, () => {
        stopReading();
        st.tonight = before;
      });
    },

    'story-done'() {
      const ctx = storyNight(Date.now());
      if (!ctx || !ctx.story) return;
      const st = app.state.stories;
      const tonightBefore = copyTonight(st.tonight);
      const before = St.markRead(st, ctx.night, ctx.story.id);
      stopReading();
      persist();
      render();
      toast('记下了，晚安', () => {
        St.unmarkRead(st, ctx.story.id, before);
        st.tonight = tonightBefore;
      });
    },

    'story-fav'() {
      const ctx = storyNight(Date.now());
      if (!ctx || !ctx.story) return;
      const on = St.toggleFavorite(app.state.stories, ctx.story.id);
      persist();
      render();
      toast(on ? '收藏了，在「全部故事」最上面' : '取消收藏了');
    },

    'story-big'() {
      app.state.stories.big = !app.state.stories.big;
      persist();
      render();
    },

    'story-block'(el) {
      const ctx = storyNight(Date.now());
      if (!ctx || !ctx.story) return;
      const st = app.state.stories;
      const target = el.dataset.target;
      const c = St.info(ctx.index, ctx.story).collection;
      const name = target === c.id ? `《${c.title}》这部` : `《${ctx.story.title}》`;
      St.block(st, target);
      stopReading();
      persist();
      render();
      window.scrollTo(0, 0);
      toast(`以后不再推荐${name}`, () => {
        stopReading();
        St.unblock(st, target);
      });
    },

    'story-unblock'(el) {
      St.unblock(app.state.stories, el.dataset.target);
      persist();
      render();
    },

    'story-lang'(el) {
      const st = app.state.stories;
      const was = St.tonight(index(), st, night());
      St.setLang(index(), st, night(), el.dataset.lang);
      const now = St.tonight(index(), st, night());
      if (!was || !now || was.id !== now.id) stopReading();
      persist();
      render();
    },

    'story-rate'(el) {
      const rate = Number(el.dataset.rate);
      if (!St.RATES.includes(rate)) return;
      app.state.stories.rate = rate;
      persist();
      if (ui.reading && ui.reading.playing) speakFrom(ui.reading.index);
      else render();
    },

    'hide-story-card'() {
      const ctx = storyNight(Date.now());
      if (!ctx) return;
      const prefs = app.state.prefs;
      const before = prefs.storyCardHidden;
      prefs.storyCardHidden = ctx.night;
      persist();
      render();
      toast('今晚不再显示，想听时到「工具 → 睡前故事」', () => { prefs.storyCardHidden = before; });
    },

    'story-retry'() {
      const ctx = storyNight(Date.now());
      if (ctx && ctx.story) delete storyTexts[ctx.story.c];
      render();
    },
  };

  Object.assign(app, { storyActions, stopReading, setStoryVoice });
})();
