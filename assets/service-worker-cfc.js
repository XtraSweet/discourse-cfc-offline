/**
 * CFC Offline – Service Worker extension
 * ────────────────────────────────────────
 * Registered via DiscoursePluginRegistry.service_workers.
 * Appended to the end of Discourse's /service-worker.js.
 *
 * Adds a `fetch` event handler (the stock SW has none) that implements
 * network-first caching for:
 *   • Navigation requests (HTML shell)  → enables offline page-refresh
 *   • Static assets (/assets, /theme-javascripts, /stylesheets, /uploads,
 *     /fonts, /images, /svg-sprite, CDN scripts)
 *
 * On first online visit everything is transparently cached.
 * On an offline refresh the cached HTML + assets are served so the
 * Ember app boots and our CFC panel works from IndexedDB data.
 */

var CFC_CACHE = "cfc-offline-v1";

// ── Install: pre-cache the offline fallback page ──────────────────
// Discourse's offline route is /offline (OfflineController).
// Wrapped in try/catch so install still succeeds if the route is
// unreachable (e.g. first install while offline).

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(CFC_CACHE)
      .then(function (cache) {
        return cache.addAll(["/offline"]).catch(function () {
          // /offline may 404 during first install or on some configs —
          // the SW still activates; the fallback just won't be pre-cached.
          console.warn("[CFC SW] Could not pre-cache /offline — continuing");
        });
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

// ── Activate: claim clients immediately, prune old CFC caches ────
// Only deletes caches prefixed with "cfc-offline-" (our own namespace)
// and the now-obsolete "cfc-vendor-v1" cache that cached-loader used.

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) {
              return (
                (k.indexOf("cfc-offline-") === 0 && k !== CFC_CACHE) ||
                k === "cfc-vendor-v1"
              );
            })
            .map(function (k) {
              return caches.delete(k);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Network-first strategy: try network → cache response → return it.
 * On failure, return cached version (or optional fallback).
 */
function networkFirst(request, fallbackUrl) {
  return fetch(request)
    .then(function (response) {
      if (response.ok) {
        var clone = response.clone();
        caches.open(CFC_CACHE).then(function (c) {
          c.put(request, clone);
        });
      }
      return response;
    })
    .catch(function () {
      return caches.match(request).then(function (cached) {
        if (cached) return cached;
        if (fallbackUrl) return caches.match(fallbackUrl);
        return new Response("", { status: 503, statusText: "Offline" });
      });
    });
}

// ── Message handler: allow client to force activation ─────────────
self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ── Fetch: intercept and cache selectively ───────────────────────

self.addEventListener("fetch", function (event) {
  var request = event.request;

  // Only handle GET requests
  if (request.method !== "GET") return;

  var url = new URL(request.url);
  var isSameOrigin = url.origin === self.location.origin;
  var isKnownCDN =
    url.hostname === "cdn.jsdelivr.net" || url.hostname === "unpkg.com";

  // Ignore requests that are neither same-origin nor known CDNs
  if (!isSameOrigin && !isKnownCDN) return;

  // Skip volatile / real-time endpoints that must never be cached
  if (
    isSameOrigin &&
    (url.pathname.indexOf("/message-bus/") === 0 ||
      url.pathname.indexOf("/presence/") === 0 ||
      url.pathname.indexOf("/session/") === 0 ||
      url.pathname.indexOf("/push_notifications/") === 0 ||
      url.pathname.indexOf("/srv/") === 0 ||
      url.pathname.indexOf("/posts") === 0 ||
      url.pathname.indexOf("/topics") === 0 ||
      url.pathname.indexOf("/draft") === 0 ||
      url.pathname.indexOf("/user-api-key") === 0 ||
      url.pathname.indexOf("/notifications") === 0 ||
      url.pathname === "/site" ||
      url.pathname.indexOf("/site/") === 0 ||
      url.pathname.indexOf("/pageview") === 0 ||
      url.pathname.indexOf("/clicks") === 0)
  )
    return;

  // ── Navigation requests (HTML page loads) ──────────────────────
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/offline"));
    return;
  }

  // ── Static assets: JS, CSS, fonts, images, CDN scripts ─────────
  if (
    (isSameOrigin &&
      (url.pathname.indexOf("/assets/") === 0 ||
        url.pathname.indexOf("/theme-javascripts/") === 0 ||
        url.pathname.indexOf("/stylesheets/") === 0 ||
        url.pathname.indexOf("/uploads/") === 0 ||
        url.pathname.indexOf("/svg-sprite/") === 0 ||
        url.pathname.indexOf("/fonts/") === 0 ||
        url.pathname.indexOf("/images/") === 0 ||
        url.pathname.indexOf("/extra-locales/") === 0 ||
        url.pathname.indexOf("/highlight-js/") === 0)) ||
    isKnownCDN
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  // All other same-origin requests: let the browser handle normally
});

  // All other same-origin requests: let the browser handle normally
});
