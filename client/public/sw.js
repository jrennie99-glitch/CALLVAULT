const CACHE_NAME = 'call-vault-v3';
const STATIC_ASSETS = [
  '/',
  '/favicon.png',
  '/manifest.json',
  '/offline.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Handle push notifications for incoming calls
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    
    const options = {
      body: data.body || 'Incoming call',
      icon: '/favicon.png',
      badge: '/favicon.png',
      vibrate: [200, 100, 200, 100, 200, 100, 200],
      tag: data.tag || 'call-notification',
      requireInteraction: true,
      actions: data.type === 'call' ? [
        { action: 'answer', title: 'Answer' },
        { action: 'decline', title: 'Decline' }
      ] : [],
      data: data
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'Call Vault', options)
    );
  } catch (e) {
    console.error('Push notification error:', e);
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const data = event.notification.data || {};
  let url = '/';
  
  if (data.type === 'call' && data.from_address) {
    url = `/call/${data.from_address}`;
  } else if (data.type === 'message' && data.convo_id) {
    url = `/chat/${data.convo_id}`;
  }
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app is open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'notification-click', data });
          return;
        }
      }
      // Otherwise open new window
      return clients.openWindow(url);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  if (url.pathname.startsWith('/ws') || 
      url.pathname.startsWith('/api') ||
      url.protocol === 'ws:' ||
      url.protocol === 'wss:') {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match('/offline.html'))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200 && event.request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
