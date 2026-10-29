(function () {
  'use strict';
  // 「哄睡声音」：放白噪音、粉红噪音、棕色噪音或嘘嘘声，定时慢慢变小再停。
  // 用 <audio loop> 循环一小段现场生成的 WAV：iPhone 锁屏后也能接着放，锁屏上还有播放控制
  const { noise: N, art: A, app } = globalThis.Baby;
  const { ui } = app;

  const TIMERS = [15, 30, 60, 0];
  const FADE_MS = 15000;
  const urls = {};
  let audio = null;
  let ticker = null;

  const kindOf = (id) => N.KINDS.find((k) => k.id === id) || N.KINDS[0];
  const urlOf = (kind) => urls[kind] || (urls[kind] = URL.createObjectURL(new Blob([N.wav(N.samples(kind))], { type: 'audio/wav' })));

  /** 开始放，或者换一种声音接着放（时间不重新算） */
  function startNoise(keepUntil = false) {
    const until = keepUntil && ui.noiseOn ? ui.noiseOn.until : ui.noiseMinutes ? Date.now() + ui.noiseMinutes * 60000 : null;
    if (!audio) {
      audio = new Audio();
      audio.loop = true;
    }
    audio.src = urlOf(ui.noiseKind);
    audio.volume = ui.noiseVolume;
    const played = audio.play();
    if (played && played.catch) {
      played.catch(() => {
        stopNoise();
        app.render();
        app.oops('没放出声音，再点一次试试');
      });
    }
    ui.noiseOn = { until };
    if ('mediaSession' in navigator && typeof MediaMetadata === 'function') {
      navigator.mediaSession.metadata = new MediaMetadata({ title: kindOf(ui.noiseKind).name, artist: '蜜罐 · 哄睡声音' });
    }
    clearInterval(ticker);
    ticker = setInterval(tick, 1000);
  }

  function stopNoise() {
    clearInterval(ticker);
    ticker = null;
    if (audio) audio.pause();
    ui.noiseOn = null;
  }

  /** 到时间停下；最后 15 秒慢慢变小（iPhone 上网页改不了音量，就到点直接停） */
  function tick() {
    const on = ui.noiseOn;
    if (!on || !on.until) return;
    const left = on.until - Date.now();
    if (left <= 0) {
      stopNoise();
      app.render();
      app.toast('时间到了，声音停了');
    } else if (left < FADE_MS && audio) {
      audio.volume = ui.noiseVolume * (left / FADE_MS);
    }
  }

  function setNoiseVolume(v) {
    ui.noiseVolume = Math.min(1, Math.max(0.05, v));
    if (audio && ui.noiseOn) audio.volume = ui.noiseVolume;
  }

  function noiseStatus() {
    const on = ui.noiseOn;
    if (on) return { live: true, text: `正在放${kindOf(ui.noiseKind).name}${on.until ? ` · 还剩 <b data-until="${on.until}"></b>` : ''}` };
    return { text: '白噪音、粉红噪音、嘘嘘声，定时关' };
  }

  /** 在别的页面上也挂一条，点了回来 */
  function noiseLive(route) {
    const on = ui.noiseOn;
    if (!on || route.sub === 'noise') return [];
    return [`<a class="live live-sleep" href="#/tools/noise">${A.icon.sound}<span>${kindOf(ui.noiseKind).name}${on.until ? ` · 还剩 <b data-until="${on.until}"></b>` : ' · 一直放'}</span>${A.icon.chevronRight}</a>`];
  }

  function viewNoiseTool() {
    const on = ui.noiseOn;
    const kind = kindOf(ui.noiseKind);
    return `
      <article class="card tool-card noise-card">
        <p class="tool-lead">宝宝哭闹、不好入睡时放一段：单调的声音能盖住周围的响动，也有点像在妈妈肚子里听到的声音。</p>
        <div class="noise-kinds" role="group" aria-label="放哪种声音">
          ${N.KINDS.map((k) => `
            <button type="button" class="noise-kind" id="noise-${k.id}" data-action="noise-kind" data-kind="${k.id}" aria-pressed="${k.id === kind.id}">
              <b>${k.name}</b><small>${k.about}</small>
            </button>`).join('')}
        </div>
        <div class="noise-row">
          <span>多久后停</span>
          <div class="recipe-chips" role="group" aria-label="多久后停">
            ${TIMERS.map((m) => `<button type="button" class="chip" id="noise-timer-${m}" data-action="noise-timer" data-minutes="${m}" aria-pressed="${ui.noiseMinutes === m}">${m ? `${m} 分钟` : '一直放'}</button>`).join('')}
          </div>
        </div>
        <label class="noise-row noise-volume"><span>音量</span><input type="range" id="noise-volume" min="0.05" max="1" step="0.05" value="${ui.noiseVolume}" aria-label="音量"></label>
        ${on ? `
          <div class="noise-now">
            <p>${A.icon.sound}<span>正在放<b>${kind.name}</b>${on.until ? ` · 还剩 <b data-until="${on.until}"></b>` : ' · 一直放'}</span></p>
            <button type="button" class="btn btn-ghost btn-block" id="noise-stop" data-action="noise-stop">停下</button>
          </div>` : `
          <button type="button" class="btn btn-block" id="noise-start" data-action="noise-start">开始放</button>`}
        <p class="hint">iPhone 上调音量用手机侧边的音量键；锁屏以后也会接着放。</p>
      </article>
      <p class="fineprint">手机放在离宝宝 2 米左右的地方，别放进小床或者挂在床栏上；音量小一点，在宝宝头边听着像轻轻的雨声就够了（医院新生儿室的噪音上限是 50 分贝）；宝宝睡着后定时关掉，别整夜大声放。参考《Pediatrics》2014 年对婴儿助眠机音量的研究。</p>`;
  }

  const noiseActions = {
    'noise-kind'(el) {
      ui.noiseKind = kindOf(el.dataset.kind).id;
      if (ui.noiseOn) startNoise(true);
      ui.focusNext = el.id;
      app.render();
    },
    'noise-timer'(el) {
      ui.noiseMinutes = TIMERS.includes(Number(el.dataset.minutes)) ? Number(el.dataset.minutes) : 30;
      if (ui.noiseOn) ui.noiseOn.until = ui.noiseMinutes ? Date.now() + ui.noiseMinutes * 60000 : null;
      ui.focusNext = el.id;
      app.render();
    },
    'noise-start'() {
      startNoise();
      app.render();
    },
    'noise-stop'() {
      stopNoise();
      app.render();
    },
  };

  Object.assign(app, { viewNoiseTool, noiseStatus, noiseLive, noiseActions, setNoiseVolume, stopNoise });
})();
