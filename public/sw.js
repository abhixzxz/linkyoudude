/* Link Your Dude service worker.
 *
 * - Pages: network first, falling back to the last cached copy, then /offline.
 * - /_next/static/*: cache first (file names are content hashed).
 * - /api/* and other origins (Supabase): never touched, always live.
 *
 * Registered as /sw.js?v=<build id>; a new build installs a fresh precache.
 */
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const PRECACHE = `lyd-precache-${VERSION}`;
const STATIC_CACHE = "lyd-static";
const PAGE_CACHE = "lyd-pages";
const OFFLINE_URL = "/offline";
const PRECACHE_URLS = ["/", OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];
const MAX_STATIC_ENTRIES = 200;
const MAX_PAGE_ENTRIES = 30;

async function trimCache(name, maxEntries) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - maxEntries))) {
    await cache.delete(key);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      await cache.addAll(PRECACHE_URLS);
      // Also store the scripts and styles those pages load, so the offline
      // page renders properly without a network.
      const staticCache = await caches.open(STATIC_CACHE);
      for (const url of ["/", OFFLINE_URL]) {
        const response = await cache.match(url);
        if (!response) continue;
        const html = await response.text();
        const assets = new Set(
          [...html.matchAll(/(?:href|src)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]),
        );
        await Promise.all(
          [...assets].map((asset) => staticCache.add(asset).catch(() => undefined)),
        );
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PRECACHE, STATIC_CACHE, PAGE_CACHE]);
      for (const name of await caches.keys()) {
        if (name.startsWith("lyd-") && !keep.has(name)) await caches.delete(name);
      }
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })(),
  );
});

async function handleNavigation(event) {
  const { request } = event;
  const url = new URL(request.url);
  // Shared text arrives in the query string; don't keep it in the cache.
  const cacheable = !url.search && url.pathname !== "/share";
  try {
    const response = (await event.preloadResponse) || (await fetch(request));
    if (cacheable && response.ok && !response.redirected && response.type === "basic") {
      const copy = response.clone();
      event.waitUntil(
        caches
          .open(PAGE_CACHE)
          .then((cache) => cache.put(request, copy))
          .then(() => trimCache(PAGE_CACHE, MAX_PAGE_ENTRIES)),
      );
    }
    return response;
  } catch {
    const cached =
      (cacheable && (await caches.match(request, { cacheName: PAGE_CACHE }))) ||
      (await caches.match(url.pathname, { cacheName: PRECACHE })) ||
      (await caches.match(OFFLINE_URL, { cacheName: PRECACHE }));
    return cached || new Response("You're offline.", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

async function handleStatic(event) {
  const cached = await caches.match(event.request);
  if (cached) return cached;
  const response = await fetch(event.request);
  if (response.ok) {
    const copy = response.clone();
    event.waitUntil(
      caches
        .open(STATIC_CACHE)
        .then((cache) => cache.put(event.request, copy))
        .then(() => trimCache(STATIC_CACHE, MAX_STATIC_ENTRIES)),
    );
  }
  return response;
}

async function handleIcon(event) {
  const cached = await caches.match(event.request);
  const network = fetch(event.request)
    .then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(STATIC_CACHE);
        await cache.put(event.request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  return (await network) || new Response(null, { status: 504 });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event));
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(handleStatic(event));
  } else if (
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    /^\/(icon|apple-icon)/.test(url.pathname)
  ) {
    event.respondWith(handleIcon(event));
  }
});
