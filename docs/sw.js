/* PCR Staff App — offline shell (network-first HTML) */
const CACHE = 'pcr-staff-v2.7.1';
const SHELL = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isGoogleHost(hostname) {
  return hostname.includes('google') || hostname.includes('script.google');
}

function isDocumentRequest(request) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  if (accept.includes('text/html')) return true;
  try {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path.endsWith('/') || path.endsWith('/index.html') || /\/index\.html$/i.test(path)) return true;
    // bare app root on GitHub Pages
    if (/\/PC-Staff-App-V2\/?$/i.test(path)) return true;
  } catch (_) {}
  return false;
}

async function networkFirst(request) {
  try {
    const res = await fetch(request);
    if (res && res.ok && new URL(request.url).origin === self.location.origin) {
      const clone = res.clone();
      const cache = await caches.open(CACHE);
      await cache.put(request, clone);
    }
    return res;
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // fallback to cached index for navigations
    const shell = await caches.match('./index.html') || await caches.match('./');
    if (shell) return shell;
    throw _;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await caches.match(request);
  const fetched = fetch(request)
    .then((res) => {
      if (res && res.ok && new URL(request.url).origin === self.location.origin) {
        cache.put(request, res.clone());
      }
      return res;
    })
    .catch(() => cached);
  return cached || fetched;
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Never cache API / Apps Script / Google hostnames
  if (isGoogleHost(url.hostname)) return;
  if (e.request.method !== 'GET') return;

  if (isDocumentRequest(e.request)) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  // Same-origin static assets: stale-while-revalidate
  if (url.origin === self.location.origin) {
    e.respondWith(staleWhileRevalidate(e.request));
  }
});
