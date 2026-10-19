(function () {
  'use strict';
  // 提示条、保存、导出文件、读表单
  const { dates: D, content: C, model: M, storage: S, calendar: Cal, art: A, app } = globalThis.Baby;
  const { toastBox, esc, kg, notifyPermission, isTouch, ui, GL_TAGS, glText, render } = app;

  // ---------- 提示条 ----------

  // 打开的弹窗之外的内容点不到也看不见，要放进最上面那个弹窗里
  const topLayer = () => [...document.querySelectorAll('dialog[open]')].pop() || document.body;

  let toastTimer = 0;
  /**
   * 小蜜蜂提示条。undo 给一个「撤销」按钮；button 换成别的按钮，例如 { label: '更新', action: 'reload-app' }；
   * tone 为 'oops' 时是出错，换成担心的蜜蜂
   */
  function toast(message, undo, button, tone = 'cheer') {
    const host = topLayer();
    if (toastBox.parentNode !== host) host.appendChild(toastBox);
    ui.undo = undo || null;
    const btn = button ? `<button type="button" class="toast-btn" data-action="${button.action}">${esc(button.label)}</button>`
      : undo ? '<button type="button" class="toast-btn" data-action="undo">撤销</button>' : '';
    toastBox.innerHTML = `
      <div class="toast toast-${tone}" role="status">
        <span class="toast-bee">${tone === 'oops' ? A.beeWorried : A.bee}</span>
        <span class="toast-msg">${esc(message)}</span>
        ${btn}
      </div>`;
    toastBox.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastBox.classList.remove('show');
      ui.undo = null;
    }, button ? 10000 : undo ? 6000 : 3200);
  }

  const oops = (message) => toast(message, null, null, 'oops');

  const said = {};
  /** 同一件事几种说法轮着用，免得每次都一样；{baby} 换成宝宝小名，其它 {名字} 从 vars 里取 */
  function say(key, vars = {}) {
    const list = C.CHEERS[key];
    said[key] = ((said[key] ?? -1) + 1) % list.length;
    const baby = (app.state && app.state.profile.nickname) || '宝宝';
    return list[said[key]].replace(/\{(\w+)\}/g, (_, k) => (k === 'baby' ? baby : vars[k] ?? ''));
  }

  // 做完一件要紧事时，从按钮那里冒出几颗爱心和蜂蜜。
  // 按钮马上会被重绘掉、所在的弹窗可能马上关掉，所以先记下位置，等这一轮处理完再挂到最上层
  const BURST = ['heart', 'drop', 'heart', 'comb', 'heart', 'drop', 'heart', 'comb', 'heart'];
  function cheer(from) {
    if (!from || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = from.getBoundingClientRect();
    if (!r.width && !r.height) return;
    setTimeout(() => {
      const box = document.createElement('div');
      box.className = 'burst';
      box.setAttribute('aria-hidden', 'true');
      box.style.left = `${(r.left + r.width / 2).toFixed(1)}px`;
      box.style.top = `${(r.top + r.height / 2).toFixed(1)}px`;
      box.innerHTML = BURST.map((kind, i) => {
        const angle = ((i - (BURST.length - 1) / 2) * 21 - 90 + (Math.random() * 10 - 5)) * (Math.PI / 180);
        const dist = 54 + Math.random() * 40;
        const style = `--x:${(Math.cos(angle) * dist).toFixed(1)}px;--y:${(Math.sin(angle) * dist).toFixed(1)}px;--r:${Math.round(Math.random() * 70 - 35)}deg;--d:${i * 22}ms`;
        return `<i style="${style}">${A.burst[kind]}</i>`;
      }).join('');
      topLayer().appendChild(box);
      setTimeout(() => box.remove(), 1500);
    }, 0);
  }

  // ---------- 新版本 ----------

  // 从主屏幕图标打开时没有刷新按钮，切回前台多半也只是把后台的旧页面拿出来，不会重新加载。
  // 切回来时把页面用到的文件和服务器上的比一比（缓存里存的就是这次打开用的），变了就提示更新
  const UPDATE_GAP = 60 * 60 * 1000;
  let updateCheckedAt = Date.now();
  async function checkForUpdate(now = Date.now()) {
    if (!ui.updateReady) {
      if (now - updateCheckedAt < UPDATE_GAP || !window.caches || navigator.onLine === false) return false;
      updateCheckedAt = now;
      const files = [location.href.split('#')[0], ...[...document.querySelectorAll('script[src], link[rel="stylesheet"]')].map((el) => el.src || el.href)];
      try {
        const changed = await Promise.all(files.map(async (url) => {
          const old = await window.caches.match(url, { ignoreSearch: true });
          if (!old) return false;
          const res = await window.fetch(url, { cache: 'no-cache' });
          return res.ok && (await res.text()) !== (await old.text());
        }));
        if (!changed.includes(true)) return false;
      } catch (e) {
        return false;
      }
      ui.updateReady = true;
    }
    toast('有新版本了', null, { label: '更新', action: 'reload-app' });
    return true;
  }

  function persist() {
    if (!S.save(app.state)) return oops('没保存成功：浏览器存储可能满了或被禁用了');
    askToKeep();
  }

  let keepAsked = false;
  /** 有了记录就请浏览器别自动清理这里的数据；每次打开只问一次，多数浏览器不弹窗，自己决定给不给 */
  function askToKeep() {
    if (keepAsked || !navigator.storage || !navigator.storage.persist) return;
    keepAsked = true;
    navigator.storage.persisted().then((kept) => kept || navigator.storage.persist()).catch(() => {});
  }

  const safeName = (filename) => filename.replace(/[\\/:*?"<>|]+/g, '-');

  function download(text, filename, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName(filename);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * 手机上弹系统分享面板（存到「文件」、AirDrop、发给自己），电脑和不支持的浏览器直接下载。
   * 返回 'shared' / 'downloaded' / 'cancelled'。分享必须在点击里同步发起，前面不能有 await
   */
  async function saveFile(text, filename, type) {
    const file = isTouch() && typeof File === 'function' ? new File([text], safeName(filename), { type }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return 'shared';
      } catch (e) {
        if (e.name === 'AbortError') return 'cancelled';
      }
    }
    download(text, filename, type);
    return 'downloaded';
  }

  function downloadCalendar(rows, filename) {
    const events = rows.map((r) => Cal.checkupEvent(r.ck, r.status));
    download(Cal.build(events, new Date()), filename, 'text/calendar;charset=utf-8');
  }

  function readProfile(form) {
    const f = new FormData(form);
    const dueDate = String(f.get('dueDate') || '');
    const error = M.dueDateError(dueDate, ui.today);
    if (error) return { error };
    const preRaw = String(f.get('preWeight') || '').trim();
    const preWeight = preRaw ? M.parseKg(preRaw) : null;
    if (preRaw && preWeight == null) return { error: '孕前体重填个数字就好，例如 52.5' };
    return { profile: { dueDate, preWeight, nickname: String(f.get('nickname') || '').trim().slice(0, 12) } };
  }

  function saveWeight(date, raw, inputsToClear) {
    const value = M.parseKg(raw);
    if (value == null) {
      oops(String(raw).trim() ? '体重填个数字就好，例如 56.2' : '先填一下体重');
      return;
    }
    if (!D.isISODate(date) || date > ui.today) {
      oops('日期不能晚于今天');
      return;
    }
    const ref = M.weightSummary(app.state, ui.today).latest;
    if (ref && Math.abs(value - ref.kg) > 10 &&
        !window.confirm(`和上次（${kg(ref.kg)} kg）差了 ${kg(Math.abs(value - ref.kg))} kg，确定没填错吗？`)) {
      return;
    }
    const before = app.state.weights.find((w) => w.date === date) || null;
    M.upsertWeight(app.state, date, value);
    persist();
    ui.clearInputs.push(...inputsToClear);
    render();
    const label = date === ui.today ? '今天' : D.formatDate(date);
    toast(`${label} ${kg(value)} kg ${say('weight')}`, () => {
      if (before) M.upsertWeight(app.state, date, before.kg);
      else M.removeWeight(app.state, date);
    });
  }

  function saveGlucose(f, beforeRender) {
    const previous = M.setGlucose(app.state, f);
    persist();
    beforeRender?.();
    render();
    const value = M.parseGlucose(f.value);
    const slot = C.GLUCOSE_SLOTS.find((s) => s.id === f.slot);
    const level = M.glucoseLevel(value, f.slot, app.state.prefs.glucoseAfter);
    const label = `${f.date === ui.today ? '今天' : D.formatDate(f.date)}${slot.name} ${glText(value)}`;
    toast(`${label} 记好了${GL_TAGS[level] ? `，${GL_TAGS[level]}` : ''}`, () => {
      M.removeGlucose(app.state, f.date, f.slot);
      if (previous) M.setGlucose(app.state, previous);
    });
  }

  function checkNotifications() {
    if (!app.state || notifyPermission() !== 'granted') return;
    const list = M.pendingNotifications(app.state, ui.today, new Date().getHours());
    if (!list.length) return;
    for (const n of list) {
      try {
        new Notification(n.title, { body: n.body, tag: n.key, icon: 'icons/favicon.svg' });
      } catch (e) {
        // 安卓 Chrome 只允许 Service Worker 发通知，这里静默跳过，页面横幅照常显示
      }
    }
    M.markNotified(app.state, list.map((n) => n.key), ui.today);
    persist();
  }

  Object.assign(app, {
    toast, oops, say, cheer, checkForUpdate, persist, saveFile, downloadCalendar, readProfile, saveWeight, saveGlucose,
    checkNotifications
  });
})();
