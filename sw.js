/* PCR Staff App V2 — app shell stored on the phone (2.10.0)
 * - Precaches the shell (HTML, CSS, fonts, logo, icons, login image) and serves it CACHE-FIRST,
 *   then revalidates in the background, so repeat opens paint without waiting for the network.
 * - A new release ships a new sw.js (VERSION below) → it installs in the background and WAITS;
 *   the page shows "Update available — tap to refresh" and sends SKIP_WAITING when tapped.
 * - NEVER caches API responses: script.google.com / googleusercontent.com always go to the network
 *   (the app keeps its own per-user data cache).
 */
const VERSION = '2.10.0';
const CACHE = 'pcr-staff-v' + VERSION;
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/app.css?v=' + VERSION,
  './assets/fa/fa.css?v=' + VERSION,
  './assets/fa/fa-solid-900.woff2',
  './assets/fa/fa-regular-400.woff2',
  './assets/golden-logo.jpg',
  './assets/slideshow/beach-house.jpg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) =>
      // HTML revalidates (cheap 304); versioned CSS / fonts / images can come from the HTTP cache the page just filled
      fetch(new Request(u, { cache: /\.(css|woff2|jpg|png)(\?|$)/.test(u) ? 'default' : 'no-cache' })).then((res) => { if (res && res.ok) return c.put(u, res); })
        .catch(() => {})
    )))
  );
  // no skipWaiting here — the page asks the user first (unless nothing is controlled yet)
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.indexOf('pcr-staff-') === 0 && k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isApiHost(url) {
  const h = url.hostname;
  return h.includes('script.google') || h.includes('googleusercontent') || h.includes('google.com') || h.includes('googleapis');
}

function isDocumentRequest(request, url) {
  if (request.mode === 'navigate') return true;
  if (url.origin !== self.location.origin) return false;
  const accept = request.headers.get('accept') || '';
  if (accept.includes('text/html')) return true;
  return /\/$|\/index\.html$/i.test(url.pathname);
}

/** Cache-first HTML shell; refresh the cached copy in the background. */
function shellResponse(e) {
  const req = e.request;
  const refresh = fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res && res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put('./index.html', copy));
    }
    return res;
  });
  e.waitUntil(refresh.catch(() => {}));
  return caches.open(CACHE).then((c) =>
    c.match('./index.html').then((hit) => hit || c.match(req, { ignoreSearch: true }))
  ).then((hit) => hit || refresh).catch(() => refresh);
}

/** Cache-first static asset; revalidate in the background. */
function assetResponse(e) {
  const req = e.request;
  return caches.open(CACHE).then((c) => c.match(req).then((hit) => {
    const refresh = fetch(req).then((res) => {
      if (res && res.ok && res.type === 'basic') c.put(req, res.clone());
      return res;
    });
    if (hit) { e.waitUntil(refresh.catch(() => {})); return hit; }
    return refresh;
  }));
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (isApiHost(url)) return;                     // API: network only, never cached here
  if (url.origin !== self.location.origin) return; // other CDNs (PDF / Excel libs): browser default
  if (url.pathname.endsWith('/sw.js')) return;
  if (isDocumentRequest(e.request, url)) { e.respondWith(shellResponse(e)); return; }
  e.respondWith(assetResponse(e));
});
