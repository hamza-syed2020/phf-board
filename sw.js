/* PHF Production Board — offline support.

   The page itself is fetched from the network FIRST, so an installed app is
   never a version behind; the cached copy is only used when there is no
   signal. Big unchanging files (the spreadsheet reader, the PDF reader, the
   icons) come straight from the cache so it still opens instantly.

   Data lives in Google Sheets, which is a different origin, so those requests
   pass through untouched and are never served stale.

   IMPORTANT: only successful replies are ever stored, and a stored reply is
   only trusted if it was successful. An earlier version kept whatever came
   back — including "file not found" — and then handed that same failure out
   for ever, long after the missing file had been uploaded. */

const CACHE = 'phf-board-v15';        // bumped: throws away every older cache
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

/* store a copy, but only when the reply was a good one */
function keep(req, res) {
  if (!res || !res.ok || res.status === 206) return res;
  const copy = res.clone();
  caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;      // Google data — leave alone

  if (isPage(req, url)) {                          // always try for the latest board
    e.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => { keep('./index.html', res); return res; })
        .catch(() => caches.match('./index.html')
                  .then(hit => hit || caches.match(req, { ignoreSearch: true })))
    );
    return;
  }

  e.respondWith(                                   // assets: cache first, refresh behind
    caches.match(req, { ignoreSearch: true }).then(hit => {
      if (hit && hit.ok) {                         // a good copy — use it, refresh quietly
        fetch(req).then(res => keep(req, res)).catch(() => {});
        return hit;
      }
      return fetch(req)                            // nothing usable stored — go and get it
        .then(res => keep(req, res))
        .catch(err => { if (hit) return hit; throw err; });
    })
  );
});
