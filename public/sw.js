const CACHE_NAME = "almacen-metal-cache-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/logo.svg"
];

// Install Service Worker and cache resources
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[Service Worker] Caching critical assets");
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate Service Worker and clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("[Service Worker] Clearing old cache:", key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch resources with Cache-First strategy fallback to network
self.addEventListener("fetch", (event) => {
  // Only cache GET requests
  if (event.request.method !== "GET") return;

  // Bypassing API calls or Firebase queries (let Firebase handle its own offline persistence)
  if (
    event.request.url.includes("firestore.googleapis.com") ||
    event.request.url.includes("identitytoolkit.googleapis.com")
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      return fetch(event.request)
        .then((networkResponse) => {
          // Put static files dynamically into cache
          if (
            networkResponse.status === 200 &&
            event.request.url.startsWith(self.location.origin)
          ) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If offline and request is document, return cached index
          if (event.request.headers.get("accept").includes("text/html")) {
            return caches.match("/index.html");
          }
        });
    })
  );
});
