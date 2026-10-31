/* global load, print, readFile, drainMicrotasks */
// service worker 的测试：假的缓存、网络和定时器，看每个请求是从缓存还是网络拿的
let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failures.push(`✗ ${name}\n    ${e.message}`);
  }
}

function eq(actual, expected, label = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label} 期望 ${b}，实际 ${a}`);
}

// ---------- 假的环境 ----------

const ORIGIN = 'https://baby.test';
const keyOf = (url) => url.replace(ORIGIN, '').replace(/^\//, '').replace(/\?.*$/, '');
const res = (body) => ({ ok: true, body, clone: () => res(body), text: async () => body });
const handlers = {};
const cache = new Map();
const net = new Map();
const posted = [];
let timers = [];
const added = [];
const deleted = [];
let cacheNames = [];
let claimed = false;
let skipped = false;

// JavaScriptCore 没有 URL，sw.js 只用它看是不是本站的请求
globalThis.URL = class {
  constructor(url) {
    this.origin = (/^https?:\/\/[^/]+/.exec(url) || [''])[0];
  }
};
globalThis.Request = class {
  constructor(url, init = {}) {
    this.url = url;
    this.cache = init.cache;
  }
};
globalThis.self = {
  location: { origin: ORIGIN },
  addEventListener: (type, fn) => { handlers[type] = fn; },
  skipWaiting: async () => { skipped = true; },
  clients: { claim: async () => { claimed = true; }, matchAll: async () => [{ postMessage: (m) => posted.push(m) }] },
};
globalThis.caches = {
  match: async (req) => {
    const key = keyOf(typeof req === 'string' ? req : req.url);
    return cache.has(key) ? res(cache.get(key)) : undefined;
  },
  open: async () => ({ put: async (req, r) => { cache.set(keyOf(req.url), r.body); }, addAll: async (reqs) => { added.push(...reqs); } }),
  keys: async () => cacheNames,
  delete: async (name) => { deleted.push(name); return true; },
};
// 每个请求都挂着，测试里决定什么时候回、回什么（回的是最近发的那个）
globalThis.fetch = (req) => {
  const key = keyOf(typeof req === 'string' ? req : req.url);
  let settle;
  const promise = new Promise((resolve, reject) => { settle = { resolve, reject }; });
  if (!net.has(key)) net.set(key, []);
  net.get(key).push(settle);
  return promise;
};
globalThis.setTimeout = (fn, ms, ...args) => {
  timers.push(() => fn(...args));
  return timers.length;
};

const drain = () => {
  for (let i = 0; i < 20; i += 1) drainMicrotasks();
};
const answer = (key, body) => {
  net.get(key).pop().resolve(res(body));
  drain();
};
const fail = (key) => {
  net.get(key).pop().reject(new TypeError('Failed to fetch'));
  drain();
};
// 时间到了：网还没回的，打开页面就不等了
const slowNetwork = () => {
  const due = timers;
  timers = [];
  due.forEach((f) => f());
  drain();
};

function request(path, { navigate = false, clientId = '', resultingClientId = '' } = {}) {
  const e = {
    request: { url: `${ORIGIN}/${path}`, method: 'GET', mode: navigate ? 'navigate' : 'no-cors' },
    clientId,
    resultingClientId,
    response: null,
    respondWith(p) { p.then((r) => { e.response = r; }, (err) => { e.error = err; }); },
    waitUntil() {},
  };
  handlers.fetch(e);
  drain();
  return e;
}

load('sw.js');

// ---------- 测试 ----------

test('网太慢：页面从缓存打开，它要的脚本也从缓存拿，是完整的一套旧版本', () => {
  cache.set('index.html', '旧页面');
  cache.set('js/app.js', '旧脚本');
  const page = request('index.html?today=2026-10-12', { navigate: true, resultingClientId: 'p1' });
  eq(page.response, null, '先等网');
  slowNetwork();
  eq(page.response && page.response.body, '旧页面');
  const js = request('js/app.js', { clientId: 'p1' });
  eq(js.response && js.response.body, '旧脚本', '不等网，也不会拿到新的');
  answer('index.html', '新页面');
  answer('js/app.js', '新脚本');
  eq([cache.get('index.html'), cache.get('js/app.js')], ['新页面', '新脚本'], '网晚到的新版照样存起来');
  eq(posted.includes('update-ready'), true, '告诉页面有新版本了');
});

test('网快：页面从网络打开，它要的脚本也等网络，不掺缓存里的旧文件', () => {
  cache.set('js/app.js', '旧脚本');
  const page = request('index.html', { navigate: true, resultingClientId: 'p2' });
  answer('index.html', '新页面');
  eq(page.response && page.response.body, '新页面');
  const js = request('js/app.js', { clientId: 'p2' });
  slowNetwork();
  eq(js.response, null, '脚本慢也接着等网络');
  answer('js/app.js', '新脚本');
  eq(js.response && js.response.body, '新脚本');
});

test('没网：页面和脚本都从缓存打开；网络页面里的请求失败了也用缓存', () => {
  cache.set('index.html', '旧页面');
  cache.set('js/app.js', '旧脚本');
  const page = request('index.html', { navigate: true, resultingClientId: 'p3' });
  fail('index.html');
  eq(page.response && page.response.body, '旧页面');
  const js = request('js/app.js', { clientId: 'p3' });
  eq(js.response && js.response.body, '旧脚本');
  const online = request('js/app.js', { clientId: 'p2' });
  fail('js/app.js');
  eq(online.response && online.response.body, '旧脚本');
});

const CURRENT = /const CACHE = '([^']+)'/.exec(readFile('sw.js'))[1];
const LISTED = /const FILES = \[([^\]]*)\]/.exec(readFile('sw.js'))[1].match(/'[^']+'/g).map((x) => x.slice(1, -1));

test('安装：清单里的文件都绕过浏览器缓存重新下载一遍存好，马上接管', () => {
  handlers.install({ waitUntil: () => {} });
  drain();
  eq([added.map((r) => r.url).join(), added.every((r) => r.cache === 'reload'), skipped], [LISTED.join(), true, true]);
});

test('换了版本：只删旧的缓存，接管已经打开的页面', () => {
  cacheNames = ['honey-pot-v1', CURRENT, 'pregnancy-desk-v3'];
  handlers.activate({ waitUntil: () => {} });
  drain();
  eq([deleted, claimed], [['honey-pot-v1', 'pregnancy-desk-v3'], true]);
});

test('第一次打开就没网，缓存里也没有：照实失败，不拿别的顶替', () => {
  cache.clear();
  const page = request('index.html', { navigate: true, resultingClientId: 'p4' });
  fail('index.html');
  eq([page.response, Boolean(page.error)], [null, true]);
});

test('别的网站的请求（比如 GitHub）不经过这里', () => {
  const e = {
    request: { url: 'https://api.github.com/repos/x/y', method: 'GET', mode: 'cors' },
    respondWith() { throw new Error('不该接管'); },
    waitUntil() {},
  };
  handlers.fetch(e);
});

print(`\nservice worker：${passed} 通过，${failures.length} 失败`);
if (failures.length) {
  print(failures.join('\n'));
  throw new Error('有测试没通过');
}
