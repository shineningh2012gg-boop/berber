import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!url || !key || !token) return NextResponse.json({ error: 'Oturum doğrulanamadı.' }, { status: 401 });

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 });

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Randevu kimliği geçersiz.' }, { status: 400 });
  let body: { status?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'İstek okunamadı.' }, { status: 400 }); }
  if (body.status !== 'confirmed' && body.status !== 'cancelled') {
    return NextResponse.json({ error: 'Randevu durumu geçersiz.' }, { status: 400 });
  }

  const { data: appointment, error: appointmentError } = await supabase
    .from('appointments')
    .select('id,business_id')
    .eq('id', id).single();
  if (appointmentError || !appointment) return NextResponse.json({ error: 'Randevu bulunamadı veya erişim izni yok.' }, { status: 404 });

  const { data: memberships } = await supabase.from('business_members').select('business_id').eq('user_id', authData.user.id);
  if (!memberships?.some((membership) => membership.business_id === appointment.business_id)) {
    return NextResponse.json({ error: 'Bu randevuyu yönetme yetkin yok.' }, { status: 403 });
  }

  const { error: updateError } = await supabase.from('appointments').update({ status: body.status }).eq('id', id);
  if (updateError) return NextResponse.json({ error: 'Randevu durumu güncellenemedi.' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
