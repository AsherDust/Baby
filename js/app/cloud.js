(function () {
  'use strict';
  // 云同步：记录加密后存进自己的 GitHub 私有仓库。打开时拉最新的，改了以后防抖传上去。
  // 每次都是「拉 → 合并 → 推」：两台手机都在记也不会互相覆盖（合并规则见 core/merge.js，分文件见 core/sync.js）。
  // 本机只记仓库设置、Token 和由密码算出来的钥匙，不存密码；这些不进备份文件
  const { dates: D, model: M, storage: S, merge: Mg, sync: Sy, art: A, app } = globalThis.Baby;
  const {
    sheetDialog, settingsDialog, esc, ui, hhmm, render, showDialog, dialogHead, closeDialog, formError, toast, oops, persist,
  } = app;

  const KEY = `${S.KEY}:cloud`;
  const API = 'https://api.github.com';
  const FOLDER = 'honey-pot';
  // 新建 Token 的页面可以用网址先填好：名字、有效期 1 年、Contents 读写（write 包括 read），只剩选仓库
  const TOKEN_URL = `https://github.com/settings/personal-access-tokens/new?${new URLSearchParams({
    name: '蜜罐云同步', description: '蜜罐 App 的云同步：读写存数据的那个仓库', expires_in: '366', contents: 'write',
  })}`;
  // 密码只有 6 位数字，钥匙算得慢一点，猜起来就慢（每台手机设置时算一次，大约一秒）；测试里会改小
  const settings = { iter: 1000000, debounce: 4000, maxWait: 30000, poll: 3 * 60 * 1000, showAfter: 30 * 1000 };

  class CloudError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
    }
  }

  // ---------- 本机记的设置 ----------

  // { repo: 'owner/name', branch, folder, token, salt, iter, key, head 上次同步到的提交, files: { 文件名: { sha, hash } }, last }
  function loadConfig() {
    try {
      const c = JSON.parse(localStorage.getItem(KEY));
      return c && c.repo && c.token && c.key && c.branch ? { files: {}, ...c } : null;
    } catch (e) {
      return null;
    }
  }

  let config = loadConfig();

  // 同步途中断开或者改了设置，旧的那份不能再写回去
  function keep(c) {
    if (config !== c) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(c));
    } catch (e) {
      // 存不下时下次打开重新全量比一遍，不影响数据
    }
  }

  // ---------- GitHub ----------

  function explain(status, detail) {
    if (status === 401) return 'Token 不对或者过期了，到「设置 → 云同步」换一个';
    if (status === 403) return /rate limit/i.test(detail) ? 'GitHub 那边请求太多了，过一会儿再试' : 'Token 没有这个仓库的写入权限';
    if (status === 404) return '找不到这个仓库，检查一下仓库名，以及 Token 能不能访问它';
    if (status >= 500) return 'GitHub 暂时出了问题，过一会儿再试';
    return `GitHub 返回了错误（${status}${detail ? `：${detail}` : ''}）`;
  }

  async function gh(c, method, path, body) {
    let res;
    try {
      res = await fetch(`${API}/repos/${c.repo}${path}`, {
        method,
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${c.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new CloudError('连不上 GitHub，可能没联网', 'offline');
    }
    if (res.ok) return res.status === 204 ? null : res.json();
    let detail = '';
    try {
      detail = (await res.json()).message || '';
    } catch (e) {
      // 没有说明就只报状态码
    }
    throw new CloudError(explain(res.status, detail), res.status);
  }

  const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');
  const inFolder = (c, name) => (c.folder ? `${c.folder}/${name}` : name);

  /** 分支现在的提交；空仓库是 null */
  async function headOf(c) {
    try {
      return (await gh(c, 'GET', `/git/ref/heads/${encPath(c.branch)}`)).object.sha;
    } catch (e) {
      if (e.code === 409) return null;
      if (e.code === 404) throw new CloudError(`找不到仓库 ${c.repo} 的「${c.branch}」分支，检查一下仓库名、分支和 Token`, 404);
      throw e;
    }
  }

  /** 文件夹里我们的文件：[{ name, sha }] */
  async function listOf(c, ref) {
    try {
      const items = await gh(c, 'GET', `/contents/${encPath(c.folder)}?ref=${encodeURIComponent(ref)}`);
      return Array.isArray(items) ? items.filter((f) => f.type === 'file' && Sy.isPart(f.name)) : [];
    } catch (e) {
      if (e.code === 404) return [];
      throw e;
    }
  }

  const blobText = async (c, sha) => text(fromB64((await gh(c, 'GET', `/git/blobs/${sha}`)).content));

  /** 一次提交多个文件；分支已经被别的手机推过了就返回 null */
  async function commit(c, parent, uploads, removes, message) {
    const base = await gh(c, 'GET', `/git/commits/${parent}`);
    const tree = await gh(c, 'POST', '/git/trees', {
      base_tree: base.tree.sha,
      tree: [
        ...uploads.map((u) => ({ path: inFolder(c, u.name), mode: '100644', type: 'blob', content: u.text })),
        ...removes.map((n) => ({ path: inFolder(c, n), mode: '100644', type: 'blob', sha: null })),
      ],
    });
    const made = await gh(c, 'POST', '/git/commits', { message, tree: tree.sha, parents: [parent] });
    try {
      await gh(c, 'PATCH', `/git/refs/heads/${encPath(c.branch)}`, { sha: made.sha, force: false });
    } catch (e) {
      if (e.code === 422) return null;
      throw e;
    }
    return made.sha;
  }

  /** 空仓库没法用上面的办法，第一个文件用 Contents 接口建，顺带建出第一个提交 */
  async function bootstrap(c, name, body, message) {
    try {
      const r = await gh(c, 'PUT', `/contents/${encPath(inFolder(c, name))}`, { message, content: toB64(bytes(body)), branch: c.branch });
      return r.commit.sha;
    } catch (e) {
      if (e.code === 422 || e.code === 409) return null;
      throw e;
    }
  }

  // ---------- 加密 ----------

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const bytes = (s) => encoder.encode(s);
  const text = (b) => decoder.decode(b);
  function toB64(b) {
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return btoa(s);
  }
  const fromB64 = (s) => Uint8Array.from(atob(String(s).replace(/\s/g, '')), (ch) => ch.charCodeAt(0));
  const canZip = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
  const pipe = async (b, stream) => new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(stream)).arrayBuffer());
  const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');

  async function deriveKey(password, salt, iter) {
    const base = await crypto.subtle.importKey('raw', bytes(password), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, 256));
  }
  const aesKey = (c) => crypto.subtle.importKey('raw', fromB64(c.key), 'AES-GCM', false, ['encrypt', 'decrypt']);

  /** 明文 → 加密信封（JSON 文字）；文件名作附加认证数据，换个文件名就解不开 */
  async function seal(c, name, plain) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const body = canZip ? await pipe(bytes(plain), new CompressionStream('gzip')) : bytes(plain);
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: bytes(name) }, await aesKey(c), body);
    return JSON.stringify({
      app: 'pregnancy-desk',
      v: 1,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iter: c.iter, salt: c.salt },
      cipher: 'AES-GCM',
      iv: toB64(iv),
      zip: canZip ? 'gzip' : null,
      data: toB64(new Uint8Array(data)),
    });
  }

  function envelopeOf(raw) {
    let env = null;
    try {
      env = JSON.parse(raw);
    } catch (e) {
      // 下面统一报
    }
    if (!env || env.app !== 'pregnancy-desk' || env.cipher !== 'AES-GCM' || !env.kdf) throw new CloudError('云端的文件不是蜜罐存的，或者坏了', 'format');
    return env;
  }

  async function unseal(c, name, raw) {
    const env = envelopeOf(raw);
    if (env.kdf.salt !== c.salt || env.kdf.iter !== c.iter) throw new CloudError('云端的数据换过密码，到「设置 → 云同步」重新填一次密码', 'key');
    let body;
    try {
      body = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(env.iv), additionalData: bytes(name) }, await aesKey(c), fromB64(env.data)));
    } catch (e) {
      throw new CloudError('密码不对，解不开云端的数据', 'key');
    }
    if (env.zip === 'gzip') {
      if (!canZip) throw new CloudError('这个浏览器太旧了，打不开云端压缩过的数据', 'format');
      body = await pipe(body, new DecompressionStream('gzip'));
    }
    return text(body);
  }

  /** git 给文件内容算的编号，上传后不用再问 GitHub 就知道 */
  async function blobSha(body) {
    const b = bytes(body);
    const head = bytes(`blob ${b.length}\0`);
    const all = new Uint8Array(head.length + b.length);
    all.set(head);
    all.set(b, head.length);
    return hex(await crypto.subtle.digest('SHA-1', all));
  }

  // ---------- 同步 ----------

  // 合并云端的记录时会保存，别因为这次保存又排一次同步
  let applying = false;

  function apply(remote) {
    applying = true;
    try {
      if (!app.state) {
        app.state = remote;
        persist();
        render();
        return { restored: true };
      }
      const r = Mg.merge(app.state, remote);
      if (JSON.stringify(r.state) === JSON.stringify(M.normalize(JSON.parse(JSON.stringify(app.state))))) return null;
      app.state = r.state;
      ui.undo = null;
      persist();
      render();
      return r;
    } finally {
      applying = false;
    }
  }

  /** 云端有新提交：只下载变了的文件，合进来 */
  async function pull(c, head) {
    const listing = await listOf(c, head);
    const files = {};
    const texts = {};
    await Promise.all(listing.map(async (f) => {
      const known = c.files[f.name];
      if (known && known.sha === f.sha) {
        files[f.name] = known;
        return;
      }
      const plain = await unseal(c, f.name, await blobText(c, f.sha));
      texts[f.name] = plain;
      files[f.name] = { sha: f.sha, hash: Sy.hash(plain) };
    }));
    let result = null;
    if (Object.keys(texts).length) {
      // 只有某个月的记录变了：其它部分跟这台的一样（云端改过、删过都会动到 main.json）
      if (!texts[Sy.MAIN] && app.state) texts[Sy.MAIN] = Sy.split(app.state)[Sy.MAIN];
      const remote = Sy.join(texts);
      if (remote) result = apply(remote);
    }
    c.files = files;
    c.head = head;
    keep(c);
    return result;
  }

  const stamp = () => `蜜罐同步 ${D.localISO(new Date())} ${hhmm(Date.now())}`;

  /** 把这台变了的文件传上去；分支被别的手机抢先推了返回 false */
  async function push(c, head) {
    if (!app.state) return true;
    // 仓库被清空、重建过：上次记的文件都不算数了，全部重新传
    if (!head) c.files = {};
    const parts = Sy.split(app.state);
    const { upload, remove } = Sy.changes(parts, c.files);
    if (!upload.length && !remove.length) return true;
    const sealed = await Promise.all(upload.map(async (name) => ({ name, text: await seal(c, name, parts[name]) })));
    let parent = head;
    if (!parent) {
      const first = sealed.find((s) => s.name === Sy.MAIN) || sealed[0];
      parent = await bootstrap(c, first.name, first.text, stamp());
      if (!parent) return false;
      c.files[first.name] = { sha: await blobSha(first.text), hash: Sy.hash(parts[first.name]) };
      c.head = parent;
      keep(c);
      sealed.splice(sealed.indexOf(first), 1);
      if (!sealed.length && !remove.length) return true;
    }
    const made = await commit(c, parent, sealed, remove, stamp());
    if (!made) return false;
    for (const s of sealed) c.files[s.name] = { sha: await blobSha(s.text), hash: Sy.hash(parts[s.name]) };
    for (const n of remove) delete c.files[n];
    c.head = made;
    keep(c);
    return true;
  }

  async function syncOnce(c) {
    let result = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const head = await headOf(c);
      if (head && head !== c.head) result = (await pull(c, head)) || result;
      if (await push(c, head)) {
        c.last = Date.now();
        keep(c);
        return result;
      }
    }
    throw new CloudError('两台手机同时在传，过一会儿再试', 'busy');
  }

  // ---------- 什么时候同步 ----------

  const status = { state: config ? 'idle' : 'off', message: '' };
  let busy = null;
  let again = false;
  let timer = 0;
  let firstDirty = 0;
  let lastTry = 0;
  const shown = new Set();

  function setStatus(state, message = '') {
    status.state = state;
    status.message = message;
    paint();
  }

  /** 立刻同步；正在同步时等这次结束再来一次。返回 { ok, result, error } */
  function syncNow(reason = 'manual') {
    if (!config) return Promise.resolve({ ok: false, error: null });
    if (busy) {
      again = true;
      return busy;
    }
    clearTimeout(timer);
    timer = 0;
    firstDirty = 0;
    lastTry = Date.now();
    const c = config;
    setStatus('syncing');
    busy = syncOnce(c).then((result) => {
      if (config === c) setStatus('idle');
      if (result && result.restored) toast('云端的记录拿下来了');
      else if (result && (result.added || result.updated || result.dropped)) {
        const what = [result.added ? `加了 ${result.added} 条` : '', result.updated ? `改了 ${result.updated} 条` : '', result.dropped ? `删了 ${result.dropped} 条` : ''];
        toast(`云端有新的记录，合进来了：${what.filter(Boolean).join('、')}`);
      }
      return { ok: true, result };
    }, (error) => {
      if (config === c) setStatus(error.code === 'offline' ? 'offline' : 'error', error.message);
      if (reason !== 'manual' && error.code !== 'offline' && !shown.has(error.message)) {
        shown.add(error.message);
        oops(`云同步：${error.message}`);
      }
      return { ok: false, error };
    }).finally(() => {
      busy = null;
      if (again) {
        again = false;
        timer = setTimeout(() => syncNow('again'), 500);
      }
    });
    return busy;
  }

  /** 每次保存后：等一会儿没有新的改动再传，一直在改也最多等 maxWait */
  function changed() {
    if (!config || applying) return;
    const now = Date.now();
    if (!firstDirty) firstDirty = now;
    clearTimeout(timer);
    timer = setTimeout(() => syncNow('change'), Math.max(0, Math.min(settings.debounce, firstDirty + settings.maxWait - now)));
    if (status.state !== 'syncing') setStatus('pending');
  }

  document.addEventListener('visibilitychange', () => {
    if (!config) return;
    if (document.hidden) {
      if (timer) syncNow('hide');
    } else if (Date.now() - lastTry > settings.showAfter) {
      syncNow('show');
    }
  });
  window.addEventListener('online', () => syncNow('online'));
  setInterval(() => {
    if (!document.hidden) syncNow('poll');
  }, settings.poll);
  // 页面加载完再拉，先让人看到这台手机上的记录
  window.addEventListener('load', () => setTimeout(() => syncNow('open'), 0));

  // ---------- 连接、断开 ----------

  function readForm(form) {
    const f = Object.fromEntries(new FormData(form));
    let repo = String(f.repo || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { error: '仓库填「用户名/仓库名」，例如 AsherDust/BabySync' };
    const folder = String(f.folder ?? FOLDER).trim().replace(/^\/+|\/+$/g, '');
    if (folder && !/^[\w.\- /]+$/.test(folder)) return { error: '文件夹名只用字母、数字、横线和斜线' };
    const same = Boolean(config && config.repo === repo && config.folder === folder);
    const token = String(f.token || '').trim() || (config && config.repo === repo ? config.token : '');
    if (!token) return { error: '填一下 GitHub Token' };
    const password = String(f.password || '').trim();
    if (!password && !same) return { error: '设一个 6 位数字的加密密码' };
    if (password && !/^\d{6}$/.test(password)) return { error: '加密密码是 6 位数字' };
    if (password !== String(f.confirm || '').trim()) return { error: '两次输的密码不一样' };
    return { repo, folder, branch: String(f.branch || '').trim(), token, password, same };
  }

  /** 检查仓库和 Token；云端已经有数据时用它的盐算钥匙、试着解开，密码不对在这里就报出来 */
  async function connect(f) {
    if (!window.crypto || !crypto.subtle) throw new CloudError('云同步要在 https 的网址下用', 'insecure');
    const c = { repo: f.repo, folder: f.folder, branch: f.branch, token: f.token, iter: settings.iter, salt: null, key: null, head: null, files: {}, last: 0 };
    const info = await gh(c, 'GET', '');
    if (!info.permissions || !info.permissions.push) throw new CloudError('这个 Token 只能读、不能写：创建时「Contents」要选「Read and write」', 'perm');
    c.branch = c.branch || info.default_branch || 'main';
    const head = await headOf(c);
    const main = head ? (await listOf(c, head)).find((x) => x.name === Sy.MAIN) : null;
    const raw = main ? await blobText(c, main.sha) : null;
    const env = raw ? envelopeOf(raw) : null;
    if (!f.password && f.same && (!env || (env.kdf.salt === config.salt && env.kdf.iter === config.iter))) {
      const sameBranch = config.branch === c.branch;
      return { ...c, salt: config.salt, iter: config.iter, key: config.key, head: sameBranch ? config.head : null, files: sameBranch ? config.files : {} };
    }
    if (!f.password) throw new CloudError('云端的数据换过密码，填一下现在的密码', 'key');
    c.salt = env ? env.kdf.salt : toB64(crypto.getRandomValues(new Uint8Array(16)));
    c.iter = env ? env.kdf.iter : settings.iter;
    c.key = toB64(await deriveKey(f.password, fromB64(c.salt), c.iter));
    if (raw) await unseal(c, Sy.MAIN, raw);
    return c;
  }

  function disconnect() {
    config = null;
    clearTimeout(timer);
    timer = 0;
    firstDirty = 0;
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      // 存储被禁用时本来也没存上
    }
    setStatus('off');
  }

  // ---------- 界面 ----------

  function lastText() {
    if (!config || !config.last) return '';
    const day = D.localISO(new Date(config.last));
    return `${day === ui.today ? '今天' : D.formatDate(day)} ${hhmm(config.last)}`;
  }

  function statusText() {
    switch (status.state) {
      case 'syncing': return '正在同步…';
      case 'pending': return '有改动，马上传上去';
      case 'offline': return `没联网，联网后自动同步${config && config.last ? `（上次同步：${lastText()}）` : ''}`;
      case 'error': return `同步出错：${status.message}`;
      case 'idle': return config && config.last ? `已同步 · ${lastText()}` : '还没同步过';
      default: return '';
    }
  }

  function paint() {
    const badge = document.querySelector('.cloud-badge');
    if (badge) {
      badge.className = `icon-btn cloud-badge cloud-${status.state}`;
      badge.title = `云同步：${statusText()}`;
      badge.setAttribute('aria-label', badge.title);
    }
    const line = document.querySelector('.cloud-state');
    if (line) {
      line.textContent = statusText();
      line.classList.toggle('cloud-state-error', status.state === 'error');
    }
  }

  /** 页头设置按钮旁边的小云朵，点了打开设置 */
  function viewCloudBadge() {
    if (!config) return '';
    const label = `云同步：${statusText()}`;
    return `<button type="button" class="icon-btn cloud-badge cloud-${status.state}" data-action="open-settings" aria-label="${esc(label)}" title="${esc(label)}">${A.icon.cloud}</button>`;
  }

  /** 设置里的「云同步」一块 */
  function viewCloudSettings() {
    if (!config) {
      return `
        <section class="settings-data settings-cloud">
          <h3>云同步</h3>
          <p class="hint">用自己的 GitHub 私有仓库存一份加密的记录：打开时自动拉最新的，改了自动传上去。换手机、爸爸妈妈两台手机一起记都方便。</p>
          <div class="btn-row">
            <button type="button" class="btn btn-ghost btn-sm" data-action="cloud-setup">${A.icon.cloud}设置云同步</button>
          </div>
        </section>`;
    }
    return `
      <section class="settings-data settings-cloud">
        <h3>云同步</h3>
        <p class="hint">加密后存在 GitHub 仓库 <b>${esc(config.repo)}</b>${config.folder ? ` 的「${esc(config.folder)}」文件夹` : ''}里，GitHub 上看到的只是乱码。打开时自动拉最新的，改了自动传上去。</p>
        <p class="hint cloud-state${status.state === 'error' ? ' cloud-state-error' : ''}" aria-live="polite">${esc(statusText())}</p>
        <div class="btn-row">
          <button type="button" class="btn btn-ghost btn-sm" data-action="cloud-sync">立即同步</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="cloud-setup">修改设置</button>
          <button type="button" class="btn btn-quiet btn-sm" data-action="cloud-off">断开</button>
        </div>
      </section>`;
  }

  function openCloudSheet() {
    const c = config;
    sheetDialog.innerHTML = `
      <form class="dialog-body cloud-sheet" data-form="cloud-setup" novalidate>
        ${dialogHead('云同步', '存进自己的 GitHub 私有仓库，加密以后才上传')}
        <label class="field">
          <span>仓库 <small>用户名/仓库名</small></span>
          <input name="repo" placeholder="AsherDust/BabySync" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(c ? c.repo : '')}">
        </label>
        <div class="field-row">
          <label class="field">
            <span>文件夹 <small>不用改</small></span>
            <input name="folder" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(c ? c.folder : FOLDER)}">
          </label>
          <label class="field">
            <span>分支 <small>空着用默认的</small></span>
            <input name="branch" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(c ? c.branch : '')}">
          </label>
        </div>
        <label class="field">
          <span>GitHub Token</span>
          <input name="token" type="password" autocomplete="off" spellcheck="false" placeholder="${c ? '已经存了，不换就空着' : 'github_pat_…'}">
        </label>
        <details class="cloud-help">
          <summary>怎么创建 Token</summary>
          <ol>
            <li>点 <a href="${TOKEN_URL}" target="_blank" rel="noopener">这里打开 GitHub 新建 Token 的页面</a>，名字、有效期（1 年）和权限都已经填好了</li>
            <li>Repository access 选「Only select repositories」，再选存数据的那个仓库</li>
            <li>看一眼下面的 Permissions：应该有一项「Contents」是「Read and write」。没有的话点「Add permissions」，选「Contents」，再改成「Read and write」</li>
            <li>点「Generate token」，复制（只显示这一次），粘贴到上面。到期以后这里会提示换新的</li>
          </ol>
        </details>
        <div class="field-row">
          <label class="field">
            <span>加密密码 <small>6 位数字</small></span>
            <input name="password" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="${c ? '不改就空着' : '6 位数字'}">
          </label>
          <label class="field">
            <span>再输一遍</span>
            <input name="confirm" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password">
          </label>
        </div>
        <p class="hint">云端的数据用这 6 位数字加密。每台手机填同一个；忘了就打不开云端的数据，手机上的记录不受影响。这台手机只记下由密码算出来的钥匙，不存密码本身。Token 要保管好，别发给别人。</p>
        <p class="form-error" hidden></p>
        <div class="dialog-actions">
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost" data-action="close-dialog">取消</button>
          <button class="btn">连接并同步</button>
        </div>
      </form>`;
    showDialog(sheetDialog);
  }

  const cloudForms = {
    async 'cloud-setup'(form) {
      const f = readForm(form);
      if (f.error) return formError(form, f.error);
      formError(form, '');
      const button = form.querySelector('button:not([type="button"])');
      button.disabled = true;
      button.textContent = '连接中…';
      let c;
      try {
        c = await connect(f);
      } catch (e) {
        button.disabled = false;
        button.textContent = '连接并同步';
        return formError(form, e.message);
      }
      config = c;
      keep(c);
      status.state = 'idle';
      closeDialog(sheetDialog);
      render();
      const r = await syncNow('manual');
      if (r.ok && !(r.result && (r.result.restored || r.result.added || r.result.updated || r.result.dropped))) {
        toast(app.state ? '云同步连好了，记录已经传上去' : '云同步连好了，云端还没有记录，先填好预产期');
      } else if (!r.ok && r.error) {
        oops(`云同步：${r.error.message}`);
      }
    },
  };

  const cloudActions = {
    'cloud-setup'() {
      if (settingsDialog.open) closeDialog(settingsDialog);
      openCloudSheet();
    },

    async 'cloud-sync'(el) {
      el.disabled = true;
      const r = await syncNow('manual');
      el.disabled = false;
      if (r.ok && !(r.result && (r.result.restored || r.result.added || r.result.updated || r.result.dropped))) toast('同步好了');
      else if (!r.ok && r.error) oops(`云同步：${r.error.message}`);
    },

    'cloud-off'() {
      if (!window.confirm('断开以后这台手机不再同步，云端的数据不会删。确定断开吗？')) return;
      disconnect();
      if (settingsDialog.open) closeDialog(settingsDialog);
      render();
      toast('云同步断开了');
    },
  };

  Object.assign(app, {
    cloudForms,
    cloudActions,
    viewCloudBadge,
    viewCloudSettings,
    cloudOn: () => Boolean(config),
    // 最近一个星期同步成功过：首页就不用催着导出备份了
    cloudSynced: () => Boolean(config && config.last && Date.now() - config.last < 7 * 24 * 3600 * 1000 && status.state !== 'error'),
    cloudChanged: changed,
    cloudOff: disconnect,
    cloud: { settings, status, syncNow, config: () => config },
  });
})();
