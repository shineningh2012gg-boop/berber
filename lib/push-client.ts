function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== '{}') return serialized;
  } catch {
    // Ignore serialization errors and use the fallback below.
  }
  return 'Tarayıcı bilinmeyen bir hata döndürdü.';
}

export async function requestBrowserPushSubscription(): Promise<PushSubscriptionJSON> {
  if (!window.isSecureContext) {
    throw new Error('Bildirimler için site HTTPS üzerinden açılmalı.');
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    throw new Error('Bu tarayıcı web bildirimlerini desteklemiyor. Siteyi Chrome üzerinden aç.');
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (!publicKey) {
    throw new Error('Bildirim anahtarı bulunamadı. NEXT_PUBLIC_VAPID_PUBLIC_KEY ayarını kontrol et.');
  }

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
  if (permission === 'default') {
    try {
      permission = await Notification.requestPermission();
    } catch (error) {
      throw new Error('Bildirim izin penceresi tamamlanamadı: ' + errorMessage(error));
    }
  }
  if (permission !== 'granted') {
    throw new Error('Tarayıcı bildirim izni vermedi. Site ayarlarından Bildirimler için İzin ver seç.');
  }

  let registration: ServiceWorkerRegistration;
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    // The ready registration is guaranteed to have an active service worker.
    registration = await navigator.serviceWorker.ready;
  } catch (error) {
    throw new Error('Bildirim servisi başlatılamadı: ' + errorMessage(error));
  }

  let existing: PushSubscription | null;
  try {
    existing = await registration.pushManager.getSubscription();
  } catch (error) {
    throw new Error('Mevcut bildirim aboneliği okunamadı: ' + errorMessage(error));
  }
  if (existing) return existing.toJSON() as PushSubscriptionJSON;

  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as BufferSource,
    });
    return subscription.toJSON() as PushSubscriptionJSON;
  } catch (error) {
    throw new Error('Bildirim aboneliği oluşturulamadı: ' + errorMessage(error));
  }
}
