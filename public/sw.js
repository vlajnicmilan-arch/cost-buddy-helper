// Self-destructing service worker.
// We previously shipped a PWA service worker that aggressively cached the
// app shell. When the Capacitor APK loads vmbalance.com, that old SW kept
// serving stale HTML/JS, which made the storage setup screen unresponsive.
// This file replaces the old SW and removes itself + all caches on install.
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_) { /* no-op */ }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const regs = await self.registration.unregister();
      const clientsList = await self.clients.matchAll({ type: 'window' });
      clientsList.forEach((c) => {
        try { c.navigate(c.url); } catch (_) { /* no-op */ }
      });
    } catch (_) { /* no-op */ }
  })());
});

// Pass through every request — never serve from cache.
self.addEventListener('fetch', () => {});
