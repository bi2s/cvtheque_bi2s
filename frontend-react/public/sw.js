// Minimal push-only service worker - no offline caching/PWA install intent,
// just the two events required to receive and act on a web push
// notification. Registered from src/pushClient.js.
self.addEventListener('push', (event) => {
  let payload = { title: 'CVthèque', body: '' };
  try {
    payload = event.data.json();
  } catch {
    // ignore malformed payloads
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'CVthèque', {
      body: payload.body || '',
      icon: '/bi2s-mark.svg',
      data: { url: payload.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
