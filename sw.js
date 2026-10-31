// 先走网络拿最新的，没网或网太慢时用上次缓存的，这样装到主屏幕后离线也能打开
// 故事正文（data/stories/*.json）不预先下载，打开过一次的会照常存进缓存
// 文件挪了位置或改了名字时把版本号加一，旧缓存会整个删掉；index.html 里加了文件也要加进这里，单元测试会查
const CACHE = 'honey-pot-v9';
const FILES = [
  './',
  'index.html',
  'css/base.css',
  'css/layout.css',
  'css/overlays.css',
  'css/today.css',
  'css/records.css',
  'css/checkups.css',
  'css/tools.css',
  'css/recipes.css',
  'css/baby.css',
  'css/mood.css',
  'css/story.css',
  'css/report.css',
  'js/core/dates.js',
  'js/core/merge.js',
  'js/core/content.js',
  'js/core/stories.js',
  'data/stories/index.js',
  'js/core/journal.js',
  'js/core/recipes.js',
  'data/recipes.js',
  'js/core/baby.js',
  'data/baby.js',
  'data/baby-food.js',
  'data/growth.js',
  'js/core/model.js',
  'js/core/storage.js',
  'js/core/sync.js',
  'js/core/calendar.js',
  'js/core/chart.js',
  'js/core/noise.js',
  'js/app/art.js',
  'js/app/base.js',
  'js/app/records.js',
  'js/app/checkups.js',
  'js/app/story.js',
  'js/app/recipes.js',
  'js/app/tools.js',
  'js/app/mood.js',
  'js/app/today.js',
  'js/app/baby.js',
  'js/app/report.js',
  'js/app/noise.js',
  'js/app/shell.js',
  'js/app/sheets.js',
  'js/app/services.js',
  'js/app/reader.js',
  'js/app/kitchen.js',
  'js/app/nursery.js',
  'js/app/cloud.js',
  'js/app/actions.js',
  'js/app/main.js',
  'icons/favicon.svg',
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  // reload：绕过浏览器的 HTTP 缓存，装进来的一定是服务器上最新的
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 医院里常有「有信号但几乎不通」的时候：打开页面等网络超过这么久，就整页都用缓存。
// 按整页定，不按一个个文件定：一部分文件新、一部分旧混在一起，可能根本跑不起来
const SLOW_MS = 3000;
// 从缓存打开的页面：它要的脚本、样式也都从缓存拿，是完整的一套旧版本
const fromCache = new Set();

/**
 * 每次都找服务器确认有没有新版（没变时只回一个很小的 304），推送后马上能用上新版，
 * 不用等 GitHub Pages 的 10 分钟缓存过期。
 * 打开页面的请求不能带额外参数复制，只能按网址重新发
 */
function fresh(req) {
  if (req.mode === 'navigate') return fetch(req.url, { cache: 'no-cache', credentials: 'same-origin', redirect: 'manual' });
  return fetch(req, { cache: 'no-cache' });
}

function cached(req) {
  return caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined));
}

// 网慢先用了缓存时，页面拿到的是旧文件；等这一批都下载完，有变化就告诉页面，让它提示「有新版本了」
let pending = 0;
let behind = false;

async function settled() {
  pending -= 1;
  if (pending || !behind) return;
  behind = false;
  const pages = await self.clients.matchAll({ type: 'window' });
  pages.forEach((page) => page.postMessage('update-ready'));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  let stale = null;
  pending += 1;
  const network = fresh(req).then(async (res) => {
    if (res.ok) {
      const copy = res.clone();
      if (stale && (await stale.text()) !== (await res.clone().text())) behind = true;
      await caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
    }
    return res;
  });
  // 先用了缓存时，网络晚到的新版照样存起来，下次打开就是新的
  e.waitUntil(network.catch(() => {}).finally(settled));
  const fromCacheCopy = async () => {
    const hit = await cached(req);
    if (hit) stale = hit.clone();
    return hit;
  };
  e.respondWith((async () => {
    if (req.mode === 'navigate') {
      const slow = new Promise((resolve) => setTimeout(resolve, SLOW_MS, 'slow'));
      try {
        const first = await Promise.race([network, slow]);
        if (first !== 'slow') return first;
      } catch (err) {
        // 没网：下面用缓存
      }
      const hit = await fromCacheCopy();
      if (!hit) return network;
      if (e.resultingClientId) fromCache.add(e.resultingClientId);
      return hit;
    }
    if (fromCache.has(e.clientId)) {
      const hit = await fromCacheCopy();
      if (hit) return hit;
    }
    try {
      return await network;
    } catch (err) {
      const hit = await cached(req);
      if (hit) return hit;
      throw err;
    }
  })());
});
