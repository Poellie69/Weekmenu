// Keeps the app shell available so Weekmenu opens quickly and can be
// installed. Recipes and the week plan always come fresh from the server.
const CACHE = 'weekmenu-shell-v2';
const BASE = new URL('./', self.location).pathname;
const SHELL = ['', 'styles.css', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png'].map((p) => BASE + p);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(BASE)) return;
  const rel = url.pathname.slice(BASE.length);
  if (rel.startsWith('api/') || rel.startsWith('photos/')) return;
  const key = e.request.mode === 'navigate' ? BASE : e.request;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && SHELL.includes(url.pathname)) caches.open(CACHE).then((c) => c.put(key, res.clone()));
        return res;
      })
      .catch(() => caches.match(key)),
  );
});
