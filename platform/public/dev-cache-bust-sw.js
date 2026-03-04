// Dev-only service worker: bypasses browser HTTP disk cache for Turbopack chunks.
// Turbopack reuses chunk URL hashes even when content changes, but browsers cache
// them as "immutable". This SW intercepts those requests and always fetches fresh.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', event => {
  const url = event.request.url;
  // Only intercept _next/static/chunks/*.js to bypass immutable cache
  if (url.includes('/_next/static/chunks/') && url.endsWith('.js')) {
    event.respondWith(
      fetch(url, { cache: 'no-store' })
    );
  }
});
