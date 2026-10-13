/**
 * sw.js — Service Worker TOEFL Yuk
 * Strategi:
 *  - Static assets (css/js/img): CacheFirst, stale-while-revalidate
 *  - HTML: NetworkFirst (update langsung terlihat, fallback cache offline)
 *  - Navigasi offline: fallback ke cache index.html
 * Versioned cache — bump CACHE_VER tiap deploy mayor.
 */

const CACHE_VER = "v14";
const STATIC_CACHE = `toefl-static-${CACHE_VER}`;
const HTML_CACHE = `toefl-html-${CACHE_VER}`;

const PRECACHE = [
  "/index.html",
  "/manifest.webmanifest",
  "/css/redesign.css",
  "/js/app.js",
  "/js/auth.js",
  "/js/supabase-config.js",
  "/js/timer.js",
  "/js/scoring.js",
  "/js/storage.js",
  "/js/tts.js",
  "/js/bottomnav.js"
];
// NB: data/ tidak diprecache — lazy-load saat user mulai test.

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((c) =>
      Promise.allSettled(PRECACHE.map((u) => c.add(u)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("toefl-") && !k.endsWith(CACHE_VER))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Jangan intercept Supabase / Google / CDN auth
  if (url.hostname.includes("supabase.co") ||
      url.hostname.includes("googleapis.com") ||
      url.hostname.includes("google.com")) return;

  // HTML: NetworkFirst
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(HTML_CACHE).then((c) => c.put(req, clone));
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit || caches.match("/index.html"))
        )
    );
    return;
  }

  // Same-origin static (css/js/img/font/data): CacheFirst + revalidate di background
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetched = fetch(req).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(req, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || fetched;
      })
    );
    return;
  }

  // CDN (fonts, supabase-js UMD, html2canvas): cache juga
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req).then((res) => {
        if (res.ok && (res.type === "basic" || res.type === "cors")) {
          const clone = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(req, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
