const CACHE = "tikatero-scan-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function cacheable(url) {
  if (url.origin !== self.location.origin || url.search) return false;
  if (url.pathname.startsWith("/_next/static/")) return true;
  return /^\/console\/events\/[^/]+\/scan$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || !cacheable(url)) return;
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request);
        if (response.ok && response.type === "basic" && !response.redirected) {
          const cache = await caches.open(CACHE);
          await cache.put(event.request, response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        return new Response("Open the scanner once while you're online, then it can work offline.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    })(),
  );
});
