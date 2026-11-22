import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { notifyBusinessOwnersForAppointmentCancellation } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getTokenHash(code: string) {
  const rawCode = code.trim().toUpperCase().replace(/^NOIR-/, '').replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{24}$/.test(rawCode)) return null;
  return createHash('sha256').update(rawCode).digest('hex');
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Takip sistemi şu anda kullanılamıyor.' }, { status: 503 });
  }

  const tokenHash = getTokenHash(request.nextUrl.searchParams.get('code') || '');
  if (!tokenHash) {
    return NextResponse.json({ error: 'Takip kodunu kontrol et.' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('get_public_appointment_by_token', {
    p_token_hash: tokenHash,
  });

  if (error) {
    console.error('Appointment tracking RPC failed:', error);
    return NextResponse.json({ error: 'Randevu bilgisi şu anda alınamıyor.' }, { status: 500 });
  }

  const appointment = Array.isArray(data) ? data[0] : data;
  if (!appointment) {
    return NextResponse.json({ error: 'Bu kodla eşleşen bir randevu bulunamadı.' }, { status: 404 });
  }

  return NextResponse.json({
    appointment: {
      serviceName: appointment.service_name,
      startsAt: appointment.starts_at,
      durationMinutes: appointment.duration_minutes,
      status: appointment.status,
      businessName: appointment.business_name || 'NOIR BARBER',
      businessAddress: appointment.business_address || null,
      businessPhone: appointment.business_phone || null,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Takip sistemi şu anda kullanılamıyor.' }, { status: 503 });
  }

  let body: { code?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'İstek okunamadı.' }, { status: 400 });
  }

  if (body.action !== 'cancel' || typeof body.code !== 'string') {
    return NextResponse.json({ error: 'İstek geçersiz.' }, { status: 400 });
  }

  const tokenHash = getTokenHash(body.code);
  if (!tokenHash) {
    return NextResponse.json({ error: 'Takip kodunu kontrol et.' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('cancel_public_appointment_by_token', {
    p_token_hash: tokenHash,
  });

  if (error) {
    console.error('Appointment cancellation RPC failed:', error);
    return NextResponse.json({ error: 'Randevu iptal edilemedi.' }, { status: 500 });
  }

  const cancelled = Array.isArray(data) ? data[0] : data;
  if (!cancelled) {
    const { data: existing, error: lookupError } = await supabase.rpc('get_public_appointment_by_token', {
      p_token_hash: tokenHash,
    });
    if (lookupError) {
      console.error('Appointment cancellation verification failed:', lookupError);
      return NextResponse.json({ error: 'Randevu durumu doğrulanamadı.' }, { status: 500 });
    }
    const appointment = Array.isArray(existing) ? existing[0] : existing;
    if (!appointment) {
      return NextResponse.json({ error: 'Bu kodla eşleşen randevu bulunamadı.' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Bu randevu artık iptal edilemiyor.' }, { status: 409 });
  }

  try {
    await notifyBusinessOwnersForAppointmentCancellation(cancelled.id);
  } catch (notificationError) {
    console.error('Could not notify business owner about cancellation:', notificationError);
  }

  return NextResponse.json({ ok: true, status: 'cancelled' });
}
