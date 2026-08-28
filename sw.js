/* ============================================================
   墨泉 · Service Worker — 离线优先缓存策略
   ============================================================ */
const CACHE = 'moquan-v3';
const ASSETS = [
  './index.html',
  './css/style.css',
  './js/utils.js',
  './js/store.js',
  './js/content.js',
  './js/prose.js',
  './js/engine.js',
  './js/ai.js',
  './js/app.js',
  './manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 网络优先 + 缓存回退：在线时永远取最新文件（写完代码刷新即生效），断网时用缓存离线可用
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res && res.status === 200 && e.request.url.startsWith(self.location.origin)) {
        const clone = res.clone();
        caches.open(CACHE).then((cache) => cache.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
