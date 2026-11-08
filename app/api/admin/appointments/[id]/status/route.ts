import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
}

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATION_FROM_EMAIL;
  if (!apiKey || !from || !to) return false;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!response.ok) console.error('Customer status email failed:', await response.text());
  return response.ok;
}

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
    .select('id,business_id,customer_name,customer_email,service_name,starts_at')
    .eq('id', id).single();
  if (appointmentError || !appointment) return NextResponse.json({ error: 'Randevu bulunamadı veya erişim izni yok.' }, { status: 404 });

  const { data: memberships } = await supabase.from('business_members').select('business_id').eq('user_id', authData.user.id);
  if (!memberships?.some((membership) => membership.business_id === appointment.business_id)) {
    return NextResponse.json({ error: 'Bu randevuyu yönetme yetkin yok.' }, { status: 403 });
  }

  const { error: updateError } = await supabase.from('appointments').update({ status: body.status }).eq('id', id);
  if (updateError) return NextResponse.json({ error: 'Randevu durumu güncellenemedi.' }, { status: 500 });

  const when = new Date(appointment.starts_at).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
  const confirmed = body.status === 'confirmed';
  const subject = confirmed ? 'NOIR BARBER · Randevun onaylandı' : 'NOIR BARBER · Randevu güncellendi';
  const html = `<h2>${confirmed ? 'Randevun onaylandı' : 'Randevun iptal edildi'}</h2><p>Merhaba ${escapeHtml(appointment.customer_name)},</p><p><b>Hizmet:</b> ${escapeHtml(appointment.service_name)}</p><p><b>Tarih:</b> ${escapeHtml(when)}</p><p>${confirmed ? 'Seni bekliyoruz.' : 'Yeni bir randevu oluşturmak için web sitemizi ziyaret edebilirsin.'}</p>`;
  const emailSent = appointment.customer_email ? await sendEmail(appointment.customer_email, subject, html) : false;
  return NextResponse.json({ ok: true, emailSent });
}
