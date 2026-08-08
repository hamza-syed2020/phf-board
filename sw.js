/* PHF Production Board — offline support.
   The data now lives in Google Sheets, which is a different origin, so those
   requests pass straight through untouched (see the origin check below) and
   are never served stale. This only caches the app itself: the page, the
   spreadsheet reader and the icons, so it opens instantly and still opens
   with no signal. */
const CACHE = 'phf-board-v10';
const SHELL = ['./', './index.html', './xlsx.full.min.js', './manifest.json',
               './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function key(url) { return url.origin + url.pathname; }

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  const fresh = req.mode === 'navigate'
             || /\.html?$/i.test(url.pathname)
             || /\.xlsx$/i.test(url.pathname);

  if (fresh) {                       // always try the network first
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(key(url), copy));
        return res;
      }).catch(() => caches.match(key(url)).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(                     // static assets: cache first, refresh quietly
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }))
  );
});
