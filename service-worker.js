const CACHE = "the-snake-501-v3";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./logic/bot.js",
  "./logic/checkout.js",
  "./logic/clock.js",
  "./logic/cricket.js",
  "./logic/darts.js",
  "./logic/doubles.js",
  "./logic/english-mode.js",
  "./logic/english.js",
  "./logic/halve.js",
  "./logic/higher.js",
  "./logic/index.js",
  "./logic/killer.js",
  "./logic/ladder.js",
  "./logic/random.js",
  "./logic/roster.js",
  "./logic/score.js",
  "./logic/sequence.js",
  "./logic/shanghai.js",
  "./logic/shell.js",
  "./logic/singles.js",
  "./logic/stats.js",
  "./logic/tournament.js",
  "./logic/winner.js",
  "./logic/x01.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/home-art.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("the-snake-501-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response && response.ok && new URL(request.url).origin === self.location.origin) {
        const cache = await caches.open(CACHE);
        cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === "navigate") {
        const fallback = await caches.match("./index.html");
        if (fallback) return fallback;
      }
      throw error;
    }
  })());
});
