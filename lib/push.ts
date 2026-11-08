import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdmin() {
  if (!url || !serviceKey) throw new Error('Push server environment is not configured.');
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function configureWebPush() {
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    throw new Error('VAPID environment is not configured.');
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

async function sendToSubscriptions(
  subscriptions: PushSubscriptionRow[],
  title: string,
  body: string,
  targetUrl: string
) {
  configureWebPush();
  const admin = getAdmin();

  await Promise.all(subscriptions.map(async (item) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: item.endpoint,
          keys: { p256dh: item.p256dh, auth: item.auth },
        },
        JSON.stringify({ title, body, url: targetUrl })
      );
    } catch (error: unknown) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await admin.from('push_subscriptions').delete().eq('id', item.id);
      } else {
        console.error('Push notification error:', status || error);
      }
    }
  }));
}

export async function notifyBusinessOwnersForAppointment(appointmentId: string) {
  const admin = getAdmin();
  const { data: appointment, error: appointmentError } = await admin
    .from('appointments')
    .select('business_id')
    .eq('id', appointmentId)
    .maybeSingle();

  if (appointmentError || !appointment) {
    throw appointmentError || new Error('Appointment not found.');
  }

  const { data, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('business_id', appointment.business_id)
    .eq('role', 'owner');

  if (error) throw error;

  await sendToSubscriptions(
    (data || []) as PushSubscriptionRow[],
    'Yeni randevu!',
    'NOIR BARBER sistemine yeni bir randevu geldi.',
    '/admin'
  );
}

export async function notifyAppointmentCustomer(appointmentId: string) {
  const admin = getAdmin();
  const { data, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('appointment_id', appointmentId)
    .eq('role', 'customer');

  if (error) throw error;

  await sendToSubscriptions(
    (data || []) as PushSubscriptionRow[],
    'Randevun onaylandı!',
    'NOIR BARBER randevunu kabul etti.',
    '/'
  );
}
