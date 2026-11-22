function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export async function requestBrowserPushSubscription(): Promise<PushSubscriptionJSON> {
  if (!window.isSecureContext) {
    throw new Error('Bildirimler için site HTTPS üzerinden açılmalı.');
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    throw new Error('Bu tarayıcı web bildirimlerini desteklemiyor.');
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (!publicKey) throw new Error('Bildirim anahtarı bulunamadı. NEXT_PUBLIC_VAPID_PUBLIC_KEY ayarını kontrol et.');

  let applicationServerKey: Uint8Array;
  try {
    applicationServerKey = urlBase64ToUint8Array(publicKey);
  } catch {
    throw new Error('Bildirim anahtarı geçersiz biçimde.');
  }
  if (applicationServerKey.length !== 65) {
    throw new Error('Bildirim anahtarı uzunluğu geçersiz. VAPID public key 65 bayt olmalı.');
  }

  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Tarayıcı bildirim izni vermedi. Site ayarlarından Bildirimler için İzin ver seç.');

  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing.toJSON() as PushSubscriptionJSON;

  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as BufferSource,
    });
    return subscription.toJSON() as PushSubscriptionJSON;
  } catch (error) {
    if (error instanceof DOMException) {
      throw new Error(`Bildirim aboneliği oluşturulamadı (${error.name}): ${error.message}`);
    }
    throw error;
  }
}
