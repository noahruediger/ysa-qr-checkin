/* Offline cache for the YSA QR Check-In app.
 *
 * - The app itself (index.html, QR libraries, icons) is cached on first visit, so the app still
 *   opens on bad venue Wi-Fi or with no signal at all.
 * - index.html is network-first: a fresh copy is used whenever the network answers within a few
 *   seconds, so updates on GitHub Pages arrive without anyone clearing caches.
 * - Fonts are cached as they're used.
 * - The Google Sheet (Apps Script) is NEVER cached: those requests always go to the network, and
 *   the app's own save queue handles being offline.
 *
 * When you change sw.js itself, bump VERSION so phones replace the old cache.
 */
var VERSION = 'qr-checkin-v1';
var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './vendor/qrious.min.js',
  './vendor/jsQR.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(VERSION).then(function (cache) { return cache.addAll(SHELL); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isApi(url) {
  return /(^|\.)script\.google(usercontent)?\.com$/i.test(url.hostname) || url.pathname === '/exec';
}
function isFont(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

// Network first, but don't wait forever on a weak connection: after 4 s use the cached copy.
function networkFirst(request, cacheKey) {
  return caches.open(VERSION).then(function (cache) {
    return new Promise(function (resolve) {
      var settled = false;
      var timer = setTimeout(function () {
        cache.match(cacheKey || request).then(function (hit) { if (hit && !settled) { settled = true; resolve(hit); } });
      }, 4000);
      fetch(request).then(function (res) {
        if (res && res.ok) cache.put(cacheKey || request, res.clone());
        clearTimeout(timer);
        if (!settled) { settled = true; resolve(res); }
      }).catch(function () {
        clearTimeout(timer);
        cache.match(cacheKey || request).then(function (hit) {
          if (!settled) { settled = true; resolve(hit || new Response('Offline and not cached yet', { status: 503 })); }
        });
      });
    });
  });
}

function cacheFirst(request) {
  return caches.open(VERSION).then(function (cache) {
    return cache.match(request).then(function (hit) {
      if (hit) return hit;
      return fetch(request).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
        return res;
      });
    });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (isApi(url)) return;                                   // live data: never cached
  if (req.mode === 'navigate') { event.respondWith(networkFirst(req, './index.html')); return; }
  if (isFont(url)) { event.respondWith(cacheFirst(req)); return; }
  if (url.origin === self.location.origin) {
    if (/\/index\.html$|\/$/.test(url.pathname)) { event.respondWith(networkFirst(req, './index.html')); return; }
    event.respondWith(cacheFirst(req));
  }
  // Anything else (Drive photos, other sites) goes straight to the network.
});
