'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Tab = 'overview' | 'profile' | 'services' | 'reviews' | 'gallery' | 'appointments';
type Business = { id: string; name: string; slug: string; phone: string | null; address: string | null; instagram_url: string | null; google_maps_url: string | null; description: string | null; opening_hours: Record<string,string> | null; is_published: boolean };
type Service = { id: string; name: string; price: number; duration_minutes: number; is_active: boolean };
type Review = { id: string; customer_name: string; review_text: string; rating: number; source: string; is_published: boolean };
type Gallery = { id: string; image_url: string; alt_text: string; is_published: boolean };
type Appointment = { id: string; customer_name: string; customer_phone: string; service_name: string; starts_at: string; status: string };

const tabs: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Genel bakış' }, { id: 'profile', label: 'İşletme bilgileri' },
  { id: 'services', label: 'Hizmetler & fiyatlar' }, { id: 'reviews', label: 'Yorumlar & puanlar' },
  { id: 'gallery', label: 'Fotoğraf galerisi' }, { id: 'appointments', label: 'Randevular' },
];

export default function AdminPage() {
  const [sessionReady, setSessionReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [business, setBusiness] = useState<Business | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [services, setServices] = useState<Service[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [gallery, setGallery] = useState<Gallery[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [serviceName, setServiceName] = useState('');
  const [servicePrice, setServicePrice] = useState('450');
  const [serviceDuration, setServiceDuration] = useState('30');
  const [reviewName, setReviewName] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState('5');
  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [profile, setProfile] = useState({ name: '', phone: '', address: '', instagram_url: '', google_maps_url: '', description: '', is_published: false });

  async function loadBusiness() {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setBusiness(null); return; }
    const { data, error } = await supabase.from('businesses').select('*').eq('slug', 'noir-barber').single();
    if (error || !data) { setNotice('İşletme bulunamadı veya bu hesap için yetki tanımlanmamış. Supabase kurulum adımlarını kontrol et.'); return; }
    const b = data as Business;
    setBusiness(b);
    setProfile({ name: b.name || '', phone: b.phone || '', address: b.address || '', instagram_url: b.instagram_url || '', google_maps_url: b.google_maps_url || '', description: b.description || '', is_published: !!b.is_published });
    const [s,r,g,a] = await Promise.all([
      supabase.from('services').select('*').eq('business_id', b.id).order('name'),
      supabase.from('customer_reviews').select('*').eq('business_id', b.id).order('created_at', { ascending: false }),
      supabase.from('gallery_images').select('*').eq('business_id', b.id).order('sort_order'),
      supabase.from('appointments').select('*').eq('business_id', b.id).order('starts_at', { ascending: false }).limit(100),
    ]);
    if (s.data) setServices(s.data as Service[]);
    if (r.data) setReviews(r.data as Review[]);
    if (g.data) setGallery(g.data as Gallery[]);
    if (a.data) setAppointments(a.data as Appointment[]);
  }

  useEffect(() => {
    if (!supabase) { setSessionReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { if (data.session) void loadBusiness(); setSessionReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) window.setTimeout(() => void loadBusiness(), 0);
      else setBusiness(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault(); if (!supabase) return;
    setBusy(true); setNotice('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false); if (error) setNotice('Giriş yapılamadı: ' + error.message);
    else { setPassword(''); await loadBusiness(); }
  }
  async function signOut() { if (supabase) await supabase.auth.signOut(); setBusiness(null); }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault(); if (!supabase || !business) return;
    setBusy(true);
    const { error } = await supabase.from('businesses').update(profile).eq('id', business.id);
    setNotice(error ? 'Kaydedilemedi: ' + error.message : 'İşletme bilgileri kaydedildi.');
    setBusy(false); if (!error) await loadBusiness();
  }
  async function addService(e: React.FormEvent) {
    e.preventDefault(); if (!supabase || !business) return;
    const { error } = await supabase.from('services').insert({ business_id: business.id, name: serviceName.trim(), price: Number(servicePrice), duration_minutes: Number(serviceDuration), is_active: true });
    setNotice(error ? 'Hizmet eklenemedi: ' + error.message : 'Hizmet eklendi.');
    if (!error) { setServiceName(''); await loadBusiness(); }
  }
  async function toggleService(item: Service) {
    if (!supabase) return;
    const { error } = await supabase.from('services').update({ is_active: !item.is_active }).eq('id', item.id);
    setNotice(error ? error.message : 'Hizmet durumu güncellendi.'); if (!error) await loadBusiness();
  }
  async function deleteService(id: string) {
    if (!supabase || !window.confirm('Bu hizmet silinsin mi?')) return;
    const { error } = await supabase.from('services').delete().eq('id', id);
    setNotice(error ? error.message : 'Hizmet silindi.'); if (!error) await loadBusiness();
  }
  async function addReview(e: React.FormEvent) {
    e.preventDefault(); if (!supabase || !business) return;
    const { error } = await supabase.from('customer_reviews').insert({ business_id: business.id, customer_name: reviewName.trim(), review_text: reviewText.trim(), rating: Number(reviewRating), source: 'manual', is_published: true });
    setNotice(error ? 'Yorum eklenemedi: ' + error.message : 'Yorum eklendi.');
    if (!error) { setReviewName(''); setReviewText(''); await loadBusiness(); }
  }
  async function toggleReview(item: Review) {
    if (!supabase) return;
    const { error } = await supabase.from('customer_reviews').update({ is_published: !item.is_published }).eq('id', item.id);
    setNotice(error ? error.message : 'Yorum durumu güncellendi.'); if (!error) await loadBusiness();
  }
  async function deleteReview(id: string) {
    if (!supabase || !window.confirm('Bu yorum silinsin mi?')) return;
    const { error } = await supabase.from('customer_reviews').delete().eq('id', id);
    setNotice(error ? error.message : 'Yorum silindi.'); if (!error) await loadBusiness();
  }
  async function addImage(e: React.FormEvent) {
    e.preventDefault(); if (!supabase || !business) return;
    const { error } = await supabase.from('gallery_images').insert({ business_id: business.id, image_url: imageUrl.trim(), alt_text: imageAlt.trim(), is_published: true, sort_order: gallery.length });
    setNotice(error ? 'Fotoğraf eklenemedi: ' + error.message : 'Fotoğraf eklendi.');
    if (!error) { setImageUrl(''); setImageAlt(''); await loadBusiness(); }
  }
  async function deleteImage(id: string) {
    if (!supabase || !window.confirm('Bu fotoğraf galeriden kaldırılsın mı?')) return;
    const { error } = await supabase.from('gallery_images').delete().eq('id', id);
    setNotice(error ? error.message : 'Fotoğraf kaldırıldı.'); if (!error) await loadBusiness();
  }
  async function setAppointmentStatus(item: Appointment, status: string) {
    if (!supabase) return;
    const { error } = await supabase.from('appointments').update({ status }).eq('id', item.id);
    setNotice(error ? error.message : 'Randevu durumu güncellendi.'); if (!error) await loadBusiness();
  }

  if (!sessionReady) return <main className="admin-page"><p>Yönetim paneli yükleniyor…</p></main>;
  if (!supabase) return <main className="admin-page"><section className="admin-login"><h1>NOIR / Yönetim</h1><p>Supabase bağlantısı bulunamadı. Ortam değişkenlerini ayarlamadan yönetim paneli kullanılamaz.</p><code>NEXT_PUBLIC_SUPABASE_URL</code><code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code></section></main>;
  if (!business) return <main className="admin-page"><form className="admin-login" onSubmit={signIn}><a className="admin-back" href="/">← Siteye dön</a><div className="eyebrow dark-eyebrow">NOIR / SECURE ACCESS</div><h1>Yönetici girişi</h1><p>İşletme hesabınla giriş yap.</p><label>E-posta<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} /></label><label>Şifre<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} /></label><button className="button button-dark" disabled={busy}>{busy ? 'Giriş yapılıyor…' : 'Giriş yap'}</button>{notice && <p className="admin-notice">{notice}</p>}<small>Hesap oluşturma herkese açık değildir. İşletme sahibi hesabı Supabase üzerinden yetkilendirilmelidir.</small></form></main>;

  return <main className="admin-page"><header className="admin-header"><a className="brand" href="/"><span className="brand-mark">N</span><span>NOIR<span className="brand-light">BARBER</span></span></a><div><span>{business.name}</span><button onClick={signOut}>Çıkış yap</button></div></header><div className="admin-layout"><aside className="admin-sidebar"><div className="admin-kicker">İŞLETME YÖNETİMİ</div>{tabs.map(item=><button key={item.id} className={tab===item.id?'selected':''} onClick={()=>setTab(item.id)}>{item.label}</button>)}</aside><section className="admin-content"><div className="admin-title"><div className="eyebrow dark-eyebrow">NOIR / CONTROL CENTER</div><h1>{tabs.find(x=>x.id===tab)?.label}</h1><p>İçerik ve işletme ayarlarını buradan yönet.</p></div>{notice && <div className="admin-notice">{notice}</div>}
{tab==='overview' && <div className="admin-stats"><article><strong>{appointments.filter(x=>x.status==='pending').length}</strong><span>Bekleyen randevu</span></article><article><strong>{services.filter(x=>x.is_active).length}</strong><span>Aktif hizmet</span></article><article><strong>{reviews.filter(x=>x.is_published).length}</strong><span>Yayındaki yorum</span></article><article><strong>{gallery.length}</strong><span>Galeri fotoğrafı</span></article></div>}
{tab==='profile' && <form className="admin-card admin-fields" onSubmit={saveProfile}><label>İşletme adı<input required value={profile.name} onChange={e=>setProfile({...profile,name:e.target.value})}/></label><label>Telefon<input value={profile.phone} onChange={e=>setProfile({...profile,phone:e.target.value})}/></label><label>Adres<input value={profile.address} onChange={e=>setProfile({...profile,address:e.target.value})}/></label><label>Instagram bağlantısı<input value={profile.instagram_url} onChange={e=>setProfile({...profile,instagram_url:e.target.value})}/></label><label>Google Maps bağlantısı<input value={profile.google_maps_url} onChange={e=>setProfile({...profile,google_maps_url:e.target.value})}/></label><label className="wide">Hakkımızda metni<textarea rows={4} value={profile.description} onChange={e=>setProfile({...profile,description:e.target.value})}/></label><label className="wide admin-publish"><input type="checkbox" checked={profile.is_published} onChange={e=>setProfile({...profile,is_published:e.target.checked})}/> Siteyi herkese açık yayınla</label><button className="button button-dark" disabled={busy}>Bilgileri kaydet</button></form>}
{tab==='services' && <><form className="admin-card admin-fields" onSubmit={addService}><label>Hizmet adı<input required value={serviceName} onChange={e=>setServiceName(e.target.value)}/></label><label>Fiyat (₺)<input required type="number" min="0" value={servicePrice} onChange={e=>setServicePrice(e.target.value)}/></label><label>Süre (dakika)<input required type="number" min="5" max="480" value={serviceDuration} onChange={e=>setServiceDuration(e.target.value)}/></label><button className="button button-dark">Hizmet ekle</button></form><div className="admin-list">{services.map(item=><article key={item.id}><div><strong>{item.name}</strong><span>{item.price} ₺ · {item.duration_minutes} dk · {item.is_active?'Aktif':'Gizli'}</span></div><button onClick={()=>toggleService(item)}>{item.is_active?'Gizle':'Yayınla'}</button><button className="danger" onClick={()=>deleteService(item.id)}>Sil</button></article>)}</div></>}
{tab==='reviews' && <><form className="admin-card admin-fields" onSubmit={addReview}><label>Müşteri adı<input required value={reviewName} onChange={e=>setReviewName(e.target.value)}/></label><label>Puan<select value={reviewRating} onChange={e=>setReviewRating(e.target.value)}>{[5,4,3,2,1].map(n=><option key={n} value={n}>{n} / 5</option>)}</select></label><label className="wide">Yorum<textarea required rows={3} value={reviewText} onChange={e=>setReviewText(e.target.value)}/></label><button className="button button-dark">Manuel yorum ekle</button><small className="wide">Yalnızca gerçek müşterilerden alınan ve paylaşım izni bulunan yorumları ekle. Manuel yorumlar Google yorumu olarak etiketlenmez.</small></form><div className="admin-list">{reviews.map(item=><article key={item.id}><div><strong>{item.customer_name} · {'★'.repeat(item.rating)}</strong><span>{item.review_text}</span><small>{item.source==='google'?'Google kaynağı':'Manuel ekleme'}</small></div><button onClick={()=>toggleReview(item)}>{item.is_published?'Gizle':'Yayınla'}</button><button className="danger" onClick={()=>deleteReview(item.id)}>Sil</button></article>)}</div></>}
{tab==='gallery' && <><form className="admin-card admin-fields" onSubmit={addImage}><label className="wide">Fotoğraf URL<input type="url" required placeholder="https://…" value={imageUrl} onChange={e=>setImageUrl(e.target.value)}/></label><label className="wide">Fotoğraf açıklaması<input value={imageAlt} onChange={e=>setImageAlt(e.target.value)}/></label><button className="button button-dark">Fotoğraf ekle</button><small className="wide">Bu ilk sürümde görseller URL ile eklenir. Dosya yükleme alanı Supabase Storage kurulunca etkinleştirilecek.</small></form><div className="admin-gallery">{gallery.map(item=><article key={item.id}><img src={item.image_url} alt={item.alt_text}/><div><span>{item.alt_text || 'Galeri görseli'}</span><button className="danger" onClick={()=>deleteImage(item.id)}>Kaldır</button></div></article>)}</div></>}
{tab==='appointments' && <div className="admin-list">{appointments.length===0 && <p>Henüz randevu kaydı yok.</p>}{appointments.map(item=><article key={item.id}><div><strong>{item.customer_name} · {item.service_name}</strong><span>{item.customer_phone} · {new Date(item.starts_at).toLocaleString('tr-TR')}</span><small>Durum: {item.status}</small></div><button onClick={()=>setAppointmentStatus(item,'confirmed')}>Onayla</button><button className="danger" onClick={()=>setAppointmentStatus(item,'cancelled')}>İptal et</button></article>)}</div>}
</section></div></main>;
}
