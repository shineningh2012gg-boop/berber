self.addEventListener('push', (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: 'Yeni bir bildirimin var.' };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'NOIR BARBER', {
      body: data.body || 'Yeni bir güncelleme var.',
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});
