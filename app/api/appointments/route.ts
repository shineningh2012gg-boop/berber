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
  const businessSlug = request.nextUrl.searchParams.get('businessSlug') || 'noir-barber';
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date) || !/^[0-9a-f-]{36}$/i.test(serviceId) || !/^[a-z0-9-]{2,60}$/.test(businessSlug)) {
    return NextResponse.json({ error: 'Tarih veya hizmet seçimi geçersiz.' }, { status: 400 });
  }

  const [{ data: business, error: businessError }, { data: service, error: serviceError }, { data, error }] = await Promise.all([
    supabase.from('businesses').select('opening_hours').eq('slug', businessSlug).eq('is_published', true).maybeSingle(),
    supabase.from('services').select('duration_minutes').eq('id', serviceId).eq('is_active', true).maybeSingle(),
    supabase.rpc('get_public_available_slots', { p_date: date, p_service_id: serviceId, p_business_slug: businessSlug }),
  ]);
  if (businessError || serviceError || error || !business || !service) {
    return NextResponse.json({ error: 'Uygun saatler alınamadı. İşletme veya hizmet bulunamadı.' }, { status: 503 });
  }

  const day = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  const dayKey = String(day === 0 ? 7 : day);
  const hours = business.opening_hours?.[dayKey] ?? (day >= 1 && day <= 6 ? '09:00-19:00' : 'closed');
  const allSlots: string[] = [];
  if (typeof hours === 'string' && /^([01]\\d|2[0-3]):[0-5]\\d-([01]\\d|2[0-3]):[0-5]\\d$/.test(hours)) {
    const [openText, closeText] = hours.split('-');
    const [openHour, openMinute] = openText.split(':').map(Number);
    const [closeHour, closeMinute] = closeText.split(':').map(Number);
    let cursor = openHour * 60 + openMinute;
    const close = closeHour * 60 + closeMinute;
    while (cursor + Number(service.duration_minutes) <= close) {
      if (!(cursor >= 12 * 60 && cursor < 13 * 60)) {
        allSlots.push(`${String(Math.floor(cursor / 60)).padStart(2, '0')}:${String(cursor % 60).padStart(2, '0')}`);
      }
      cursor += 60;
    }
  }

  const available = new Set((data || []).map((row: { slot_start: string }) => row.slot_start.slice(0, 5)));
  return NextResponse.json({ slots: allSlots.filter(slot => available.has(slot)), allSlots });
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Randevu sistemi şu anda kullanılamıyor.' }, { status: 503 });
  let body: { name?: string; phone?: string; serviceId?: string; businessSlug?: string; startsAt?: string; website?: string };
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
  const businessSlug = body.businessSlug || 'noir-barber';
  if (!/^[a-z0-9-]{2,60}$/.test(businessSlug)) return NextResponse.json({ error: 'İşletme bağlantısı geçersiz.' }, { status: 400 });
  const notificationToken = randomBytes(24).toString('hex');
  const trackingCode = 'NOIR-' + notificationToken.match(/.{1,6}/g)!.join('-');
  const notificationTokenHash = createHash('sha256').update(notificationToken).digest('hex');

  const { data, error } = await supabase.rpc('create_public_appointment', {
    p_customer_name: body.name,
    p_customer_phone: body.phone,
    p_service_id: body.serviceId,
    p_starts_at: body.startsAt,
    p_notification_token_hash: notificationTokenHash,
    p_business_slug: businessSlug,
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
    { ok: true, appointment: data, notificationToken, trackingCode },
    { status: 201 }
  );
}
