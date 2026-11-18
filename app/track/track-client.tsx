'use client';

import { useState } from 'react';

type TrackedAppointment = {
  serviceName: string;
  startsAt: string;
  durationMinutes: number;
  status: 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'completed';
  businessName: string;
  businessAddress: string | null;
  businessPhone: string | null;
};

const statusText: Record<TrackedAppointment['status'], string> = {
  pending: 'Onay bekliyor',
  confirmed: 'Onaylandı',
  rejected: 'Reddedildi',
  cancelled: 'İptal edildi',
  completed: 'Tamamlandı',
};

export default function TrackClient({ initialCode = '' }: { initialCode?: string }) {
  const [code, setCode] = useState(initialCode);
  const [appointment, setAppointment] = useState<TrackedAppointment | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);

  async function lookup(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setAppointment(null);
    try {
      const response = await fetch('/api/appointments/track?code=' + encodeURIComponent(code), { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Randevu bulunamadı.');
      setAppointment(result.appointment);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Takip bilgisi alınamadı.');
    } finally {
      setBusy(false);
    }
  }

  async function cancelAppointment() {
    if (!window.confirm('Randevunu iptal etmek istediğine emin misin?')) return;
    setCancelBusy(true);
    setError('');
    try {
      const response = await fetch('/api/appointments/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, action: 'cancel' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Randevu iptal edilemedi.');
      setAppointment(current => current ? { ...current, status: 'cancelled' } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Randevu iptal edilemedi.');
    } finally {
      setCancelBusy(false);
    }
  }

  const date = appointment ? new Date(appointment.startsAt) : null;

  return (
    <main className="track-page">
      <a className="admin-back" href="/">← NOIR BARBER</a>
      <section className="track-card">
        <div className="eyebrow dark-eyebrow">NOIR / APPOINTMENT TRACKING</div>
        <h1>Randevunu takip et</h1>
        <p>Randevu oluştururken aldığın özel takip kodunu gir.</p>
        <form onSubmit={lookup} className="track-form">
          <label>Randevu takip kodu
            <input
              value={code}
              onChange={event => setCode(event.target.value.toUpperCase())}
              placeholder="NOIR-XXXXXX-XXXXXX-..."
              autoComplete="off"
              required
            />
          </label>
          <button className="button button-dark" disabled={busy}>{busy ? 'Kontrol ediliyor…' : 'Randevumu bul'}</button>
        </form>
        {error && <p className="track-error" role="alert">{error}</p>}
        {appointment && date && (
          <div className="track-result">
            <div className="track-status">
              <span>Randevu durumu</span>
              <strong data-status={appointment.status}>{statusText[appointment.status] || appointment.status}</strong>
            </div>
            <h2>{appointment.businessName}</h2>
            <dl>
              <div><dt>Hizmet</dt><dd>{appointment.serviceName}</dd></div>
              <div><dt>Tarih</dt><dd>{date.toLocaleDateString('tr-TR', { dateStyle: 'long' })}</dd></div>
              <div><dt>Saat</dt><dd>{date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</dd></div>
              <div><dt>Süre</dt><dd>{appointment.durationMinutes} dakika</dd></div>
              {appointment.businessAddress && <div><dt>Adres</dt><dd>{appointment.businessAddress}</dd></div>}
              {appointment.businessPhone && <div><dt>Telefon</dt><dd>{appointment.businessPhone}</dd></div>}
            </dl>
            {['pending','confirmed'].includes(appointment.status) && date.getTime() > Date.now() && <button type="button" className="button button-dark" onClick={cancelAppointment} disabled={cancelBusy}>{cancelBusy ? 'İptal ediliyor…' : 'Randevuyu iptal et'}</button>}
            <p className="track-note">Randevu durumunda değişiklik olursa bu sayfayı tekrar kontrol edebilirsin.</p>
          </div>
        )}
      </section>
    </main>
  );
}
