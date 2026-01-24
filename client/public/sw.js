const CACHE_NAME = 'callvs-v6';
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
    
    // Check if this is an incoming call notification 
    const isIncomingCall = data.type === 'incoming_call' || data.type === 'call';
    // Check if this is a missed call notification
    const isMissedCall = data.type === 'missed_call';
    // Any call-related notification should get priority treatment
    const isCallRelated = isIncomingCall || isMissedCall;
    
    const options = {
      body: data.body || 'Incoming call',
      icon: '/favicon.png',
      badge: '/favicon.png',
      vibrate: isCallRelated ? [200, 100, 200, 100, 200, 100, 200, 100, 200] : [200, 100, 200],
      tag: data.tag || (isCallRelated ? 'call-notification' : 'message-notification'),
      requireInteraction: isIncomingCall, // Only keep visible for incoming calls (not missed)
      renotify: true, // Alert again even if same tag
      actions: isIncomingCall ? [
        { action: 'answer', title: 'Answer' },
        { action: 'decline', title: 'Decline' }
      ] : [],
      data: data
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'CallVS', options)
    );
  } catch (e) {
    console.error('Push notification error:', e);
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const data = event.notification.data || {};
  const action = event.action;
  let url = '/app';
  
  // Handle incoming call notifications
  const isIncomingCall = data.type === 'incoming_call' || data.type === 'call';
  if (isIncomingCall) {
    if (action === 'decline') {
      // User declined - just close notification, don't open app
      return;
    }
    // Answer or tap notification - open call screen directly
    // Server sends url in payload, or use from_address to construct path
    if (data.url) {
      url = data.url;
    } else if (data.from_address) {
      url = `/call/${data.from_address}`;
    }
  } else if (data.type === 'missed_call' && data.from_address) {
    // Missed call - open call history or contact
    url = `/call/${data.from_address}`;
  } else if (data.type === 'message' && data.convo_id) {
    url = `/chat/${data.convo_id}`;
  } else if (data.url) {
    url = data.url;
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
