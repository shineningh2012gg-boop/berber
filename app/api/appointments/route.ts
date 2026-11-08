import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
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
  if (!response.ok) console.error('Email notification failed:', await response.text());
  return response.ok;
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
  let body: { name?: string; phone?: string; email?: string; serviceId?: string; startsAt?: string; website?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Gönderilen bilgiler okunamadı.' }, { status: 400 }); }
  if (body.website) return NextResponse.json({ ok: true });
  if (typeof body.name !== 'string' || typeof body.phone !== 'string' || typeof body.email !== 'string'
      || typeof body.serviceId !== 'string' || typeof body.startsAt !== 'string'
      || !/^[0-9a-f-]{36}$/i.test(body.serviceId) || !Number.isFinite(Date.parse(body.startsAt))
      || body.name.trim().length < 2 || body.name.trim().length > 80
      || body.phone.trim().length < 10 || body.phone.trim().length > 24
      || body.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    return NextResponse.json({ error: 'Lütfen ad, telefon ve geçerli e-posta bilgilerini kontrol et.' }, { status: 400 });
  }
  const { data, error } = await supabase.rpc('create_public_appointment', {
    p_customer_name: body.name, p_customer_phone: body.phone, p_customer_email: body.email.trim(),
    p_service_id: body.serviceId, p_starts_at: body.startsAt,
  });
  if (error) {
    const message = error.message || '';
    const safeMessage = message.includes('Bu saat') || message.includes('Seçilen') || message.includes('Lütfen') || message.includes('İşletme')
      ? message : 'Randevu kaydedilemedi. Lütfen tekrar dene.';
    return NextResponse.json({ error: safeMessage }, { status: 409 });
  }
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (adminEmail) {
    const when = new Date(body.startsAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
    await sendEmail(adminEmail, 'NOIR BARBER · Yeni randevu talebi', `<h2>Yeni randevu talebi</h2><p><b>Müşteri:</b> ${escapeHtml(body.name)}</p><p><b>Telefon:</b> ${escapeHtml(body.phone)}</p><p><b>E-posta:</b> ${escapeHtml(body.email)}</p><p><b>Tarih:</b> ${escapeHtml(when)}</p><p>Randevuyu yönetim panelinden onaylayabilirsin.</p>`);
  }
  return NextResponse.json({ ok: true, appointment: data }, { status: 201 });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
}
