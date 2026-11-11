import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, createHash } from 'node:crypto';
import { notifyBusinessOwnersForAppointment } from '@/lib/push';

export const runtime = 'nodejs';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Randevu sistemi şu anda kullanılamıyor.' }, { status: 503 });
  const date = request.nextUrl.searchParams.get('date') || '';
  const serviceId = request.nextUrl.searchParams.get('serviceId') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[0-9a-f-]{36}$/i.test(serviceId)) {
    return NextResponse.json({ error: 'Tarih veya hizmet seçimi geçersiz.' }, { status: 400 });
  }
  const { data, error } = await supabase.rpc('get_public_available_slots', { p_date: date, p_service_id: serviceId });
  if (error) return NextResponse.json({ error: 'Uygun saatler alınamadı. Sistem kurulumu tamamlanmamış olabilir.' }, { status: 503 });
  return NextResponse.json({ slots: (data || []).map((row: { slot_start: string }) => row.slot_start.slice(0, 5)) });
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Randevu sistemi şu anda kullanılamıyor.' }, { status: 503 });
  let body: { name?: string; phone?: string; serviceId?: string; startsAt?: string; website?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Gönderilen bilgiler okunamadı.' }, { status: 400 }); }
  if (body.website) return NextResponse.json({ ok: true });
  if (typeof body.name !== 'string' || typeof body.phone !== 'string'
      || typeof body.serviceId !== 'string' || typeof body.startsAt !== 'string'
      || !/^[0-9a-f-]{36}$/i.test(body.serviceId) || !Number.isFinite(Date.parse(body.startsAt))
      || body.name.trim().length < 2 || body.name.trim().length > 80
      || body.phone.trim().length < 10 || body.phone.trim().length > 24) {
    return NextResponse.json({ error: 'Lütfen ad, telefon ve randevu bilgilerini kontrol et.' }, { status: 400 });
  }
  const notificationToken = randomBytes(32).toString('hex');
  const notificationTokenHash = createHash('sha256').update(notificationToken).digest('hex');

  const { data, error } = await supabase.rpc('create_public_appointment', {
    p_customer_name: body.name,
    p_customer_phone: body.phone,
    p_service_id: body.serviceId,
    p_starts_at: body.startsAt,
    p_notification_token_hash: notificationTokenHash,
  });
  if (error) {
    const message = error.message || '';
    const safeMessage = message.includes('Bu saat') || message.includes('Seçilen') || message.includes('Lütfen') || message.includes('İşletme')
      ? message : 'Randevu kaydedilemedi. Lütfen tekrar dene.';
    return NextResponse.json({ error: safeMessage }, { status: 409 });
  }
  const appointment = (Array.isArray(data) ? data[0] : data) as { id?: string } | null;
  if (appointment?.id) {
    try {
      await notifyBusinessOwnersForAppointment(appointment.id);
    } catch (notificationError) {
      console.error('Could not notify business owner:', notificationError);
    }
  }
  return NextResponse.json(
    { ok: true, appointment: data, notificationToken },
    { status: 201 }
  );
}
