const CACHE_NAME = 'blocko-pro-core-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './board.html',
  './my-tasks.html',
  './archive.html',
  './store.html',
  './products.html',
  './updates.html',
  './config.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS);
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  
  // Enterprise-защита: Игнорируем не-GET запросы и реалтайм-потоки внешних БД/API
  if (e.request.method !== 'GET' || 
      url.hostname.includes('firestore.googleapis.com') || 
      url.hostname.includes('firebasestorage.googleapis.com') || 
      url.hostname.includes('api.imgbb.com')) {
    return;
  }

  // Стратегия Stale-while-revalidate: отдаем кэш мгновенно, обновляем в фоне
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      const fetchPromise = fetch(e.request).then((networkResponse) => {
        // Кэшируем только успешные локальные запросы
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Офлайн фоллбэк: если нет сети, просто отдаем то, что есть в кэше
        return cachedResponse; 
      });

      // Возвращаем кэш сразу (0ms latency), если он есть, иначе ждем сеть
      return cachedResponse || fetchPromise;
    })
  );
});
