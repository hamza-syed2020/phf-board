/* PHF Production Board — offline support.

   The page itself is fetched from the network FIRST, so an installed app is
   never a version behind; the cached copy is only used when there is no
   signal. Big unchanging files (the spreadsheet reader, the icons) come
   straight from the cache so it still opens instantly.

   Data lives in Google Sheets, which is a different origin, so those requests
   pass through untouched and are never served stale. */

const CACHE = 'phf-board-v14';
const SHELL = [
  './',
  './index.html',
  './xlsx.full.min.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

function isPage(req, url) {
  return req.mode === 'navigate'
      || /\/$/.test(url.pathname)
      || /\.html$/i.test(url.pathname);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;      // Google data — leave alone

  if (isPage(req, url)) {                          // always try for the latest board
    e.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html')
                  .then(hit => hit || caches.match(req, { ignoreSearch: true })))
    );
    return;
  }

  e.respondWith(                                   // assets: cache first, refresh behind
    caches.match(req, { ignoreSearch: true }).then(hit => {
      const net = fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
