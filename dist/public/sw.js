const APP_NAME = "WorkAbroad Hub";
const CACHE_VERSION = "v4";
const STATIC_CACHE = `workabroad-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `workabroad-dynamic-${CACHE_VERSION}`;

// Critical assets to pre-cache on install
const PRECACHE_ASSETS = [
  "/",
  "/offline.html",
  "/logo.png",
  "/favicon.png",
  "/site.webmanifest",
];

// Routes that should always go to network first
const NETWORK_FIRST_PATTERNS = [
  /^\/api\//,
  /^\/auth\//,
];

// ── Install ────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS.map((url) => new Request(url, { cache: "reload" }))))
      .catch(() => {})
  );
  self.skipWaiting();
});

// ── Activate & clean up old caches ───────────────────────────────────────
self.addEventListener("activate", (event) => {
  const allowedCaches = [STATIC_CACHE, DYNAMIC_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !allowedCaches.includes(k)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch strategy ────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, cross-origin, and browser extension requests
  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.protocol !== "https:" && url.protocol !== "http:") return;

  // API / auth — always network first, no caching
  if (NETWORK_FIRST_PATTERNS.some((re) => re.test(url.pathname))) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: "Offline — please reconnect" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  // Navigation requests — network first, fall back to offline page
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache a copy of successful navigation responses
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match(request)
            .then((cached) => cached || caches.match("/offline.html"))
            .then((r) => r || new Response("<h1>WorkAbroad Hub — Offline</h1>", { headers: { "Content-Type": "text/html" } }))
        )
    );
    return;
  }

  // Static assets — cache first, fall back to network
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type === "opaque") {
          return response;
        }
        const clone = response.clone();
        caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, clone));
        return response;
      }).catch(() => caches.match("/offline.html"));
    })
  );
});

// ── Push notifications ────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "New notification from WorkAbroad Hub." };
  }

  const title = data.title || APP_NAME;
  const options = {
    body: data.body || "You have a new notification.",
    icon: data.icon || "/logo.png",
    badge: data.badge || "/favicon-32x32.png",
    tag: data.tag || "workabroad-hub",
    data: { url: data.url || "/" },
    vibrate: [100, 50, 100],
    requireInteraction: false,
    actions: data.actions || [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click ────────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ── Push subscription change ──────────────────────────────────────────────
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription.options)
      .then((subscription) =>
        fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription),
        })
      )
  );
});

// ── Background sync (retry failed form submissions) ───────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-analytics") {
    event.waitUntil(
      fetch("/api/analytics/sync", { method: "POST" }).catch(() => {})
    );
  }
});
