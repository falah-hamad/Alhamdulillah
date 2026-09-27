// Scripts for firebase messaging service worker
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Initialize Firebase in service worker using the exact project configuration
firebase.initializeApp({
  apiKey: "AIzaSyD7qYNCeQ5ohL4wYbrHvVmK8ibwH2tNSyo",
  authDomain: "gen-lang-client-0628217852.firebaseapp.com",
  projectId: "gen-lang-client-0628217852",
  storageBucket: "gen-lang-client-0628217852.firebasestorage.app",
  messagingSenderId: "817551423064",
  appId: "1:817551423064:web:24b24009b40ba226fdfc2d"
});

const messaging = firebase.messaging();

// Handle background push messages when website is closed or in background
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);
  const notificationTitle = payload.notification?.title || payload.data?.title || 'دفتر الديون المحاسبي';
  const notificationBody = payload.notification?.body || payload.data?.body || 'تنبيه محاسبي جديد';
  
  const notificationOptions = {
    body: notificationBody,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: payload.data || {},
    dir: 'rtl',
    lang: 'ar',
    tag: payload.data?.tag || 'accounting-alert'
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click by focusing or opening the web application
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notifData = event.notification.data || {};
  const customerId = notifData.customerId || notifData.customer_id;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            payload: { data: notifData, customerId },
          });
          return client.focus();
        }
      }
      if (clients.openWindow) {
        const targetUrl = customerId ? `/?customerId=${encodeURIComponent(customerId)}` : '/';
        return clients.openWindow(targetUrl);
      }
    })
  );
});

