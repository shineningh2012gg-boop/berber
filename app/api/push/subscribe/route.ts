import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json({ error: 'Sunucu ayarları eksik.' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { role, subscription, appointmentId } = body || {};

    if (
      !subscription?.endpoint ||
      !subscription?.keys?.p256dh ||
      !subscription?.keys?.auth ||
      !['owner', 'customer'].includes(role)
    ) {
      return NextResponse.json({ error: 'Bildirim bilgileri geçersiz.' }, { status: 400 });
    }

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let businessId: string;
    let userId: string | null = null;

    if (role === 'owner') {
      const token = request.headers.get('authorization')?.replace(/^Bearer\\s+/i, '');
      if (!token) return NextResponse.json({ error: 'Giriş gerekli.' }, { status: 401 });

      const authClient = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: authData, error: authError } = await authClient.auth.getUser(token);
      if (authError || !authData.user) {
        return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 });
      }

      userId = authData.user.id;
      const { data: membership, error: membershipError } = await admin
        .from('business_members')
        .select('business_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();

      if (membershipError || !membership) {
        return NextResponse.json({ error: 'İşletme yetkisi bulunamadı.' }, { status: 403 });
      }
      businessId = membership.business_id;
    } else {
      if (typeof appointmentId !== 'string' || !/^[0-9a-f-]{36}$/i.test(appointmentId)) {
        return NextResponse.json({ error: 'Randevu bilgisi geçersiz.' }, { status: 400 });
      }

      const { data: appointment, error: appointmentError } = await admin
        .from('appointments')
        .select('business_id')
        .eq('id', appointmentId)
        .maybeSingle();

      if (appointmentError || !appointment) {
        return NextResponse.json({ error: 'Randevu bulunamadı.' }, { status: 404 });
      }
      businessId = appointment.business_id;
    }

    const { error } = await admin.from('push_subscriptions').upsert({
      business_id: businessId,
      appointment_id: role === 'customer' ? appointmentId : null,
      user_id: userId,
      role,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Push subscription error:', error);
    return NextResponse.json({ error: 'Bildirim aboneliği kaydedilemedi.' }, { status: 500 });
  }
}
