import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { notifyBusinessOwnersForAppointmentCancellation } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Takip sistemi şu anda kullanılamıyor.' }, { status: 503 });
  }

  const suppliedCode = request.nextUrl.searchParams.get('code') || '';
  const rawCode = suppliedCode
    .trim()
    .toUpperCase()
    .replace(/^NOIR-/, '')
    .replace(/-/g, '')
    .toLowerCase();

  if (!/^[0-9a-f]{24}$/.test(rawCode)) {
    return NextResponse.json({ error: 'Takip kodunu kontrol et.' }, { status: 400 });
  }

  const tokenHash = createHash('sha256').update(rawCode).digest('hex');
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: appointment, error } = await admin
    .from('appointments')
    .select('id, business_id, customer_name, service_name, starts_at, duration_minutes, status')
    .eq('notification_token_hash', tokenHash)
    .maybeSingle();

  if (error) {
    console.error('Appointment tracking lookup failed:', error);
    return NextResponse.json({ error: 'Randevu bilgisi şu anda alınamıyor.' }, { status: 500 });
  }
  if (!appointment) {
    return NextResponse.json({ error: 'Bu kodla eşleşen bir randevu bulunamadı.' }, { status: 404 });
  }

  const { data: business } = await admin
    .from('businesses')
    .select('name, address, phone')
    .eq('id', appointment.business_id)
    .maybeSingle();

  return NextResponse.json({
    appointment: {
      serviceName: appointment.service_name,
      startsAt: appointment.starts_at,
      durationMinutes: appointment.duration_minutes,
      status: appointment.status,
      businessName: business?.name || 'NOIR BARBER',
      businessAddress: business?.address || null,
      businessPhone: business?.phone || null,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: 'Takip sistemi şu anda kullanılamıyor.' }, { status: 503 });

  let body: { code?: string; action?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'İstek okunamadı.' }, { status: 400 }); }
  if (body.action !== 'cancel' || typeof body.code !== 'string') {
    return NextResponse.json({ error: 'İstek geçersiz.' }, { status: 400 });
  }

  const rawCode = body.code.trim().toUpperCase().replace(/^NOIR-/, '').replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{24}$/.test(rawCode)) {
    return NextResponse.json({ error: 'Takip kodunu kontrol et.' }, { status: 400 });
  }

  const tokenHash = createHash('sha256').update(rawCode).digest('hex');
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: appointment, error } = await admin.from('appointments')
    .select('id,status,starts_at')
    .eq('notification_token_hash', tokenHash)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Randevu bilgisi alınamadı.' }, { status: 500 });
  if (!appointment) return NextResponse.json({ error: 'Bu kodla eşleşen randevu bulunamadı.' }, { status: 404 });
  if (!['pending', 'confirmed'].includes(appointment.status) || new Date(appointment.starts_at) <= new Date()) {
    return NextResponse.json({ error: 'Bu randevu artık iptal edilemiyor.' }, { status: 409 });
  }

  const { data: updatedAppointment, error: updateError } = await admin.from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', appointment.id)
    .eq('status', appointment.status)
    .select('id')
    .maybeSingle();
  if (updateError) return NextResponse.json({ error: 'Randevu iptal edilemedi.' }, { status: 500 });
  if (!updatedAppointment) return NextResponse.json({ error: 'Randevu durumu değişti. Sayfayı yenileyip tekrar kontrol et.' }, { status: 409 });

  try { await notifyBusinessOwnersForAppointmentCancellation(appointment.id); }
  catch (notificationError) { console.error('Could not notify business owner about cancellation:', notificationError); }

  return NextResponse.json({ ok: true, status: 'cancelled' });
}
