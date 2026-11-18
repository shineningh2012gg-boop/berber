'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { requestBrowserPushSubscription } from '@/lib/push-client';

type Tab = 'overview' | 'profile' | 'services' | 'reviews' | 'gallery' | 'appointments' | 'maintenance';
type Business = { id: string; name: string; slug: string; phone: string | null; address: string | null; instagram_url: string | null; google_maps_url: string | null; description: string | null; opening_hours: Record<string,string> | null; is_published: boolean };
type Service = { id: string; name: string; price: number; duration_minutes: number; is_active: boolean };
type Review = { id: string; customer_name: string; review_text: string; rating: number; source: string; is_published: boolean };
type Gallery = { id: string; image_url: string; storage_path: string | null; alt_text: string; is_published: boolean; sort_order: number };
type Appointment = { id: string; customer_name: string; customer_phone: string; service_name: string; starts_at: string; status: string };
type MaintenanceTask = { id: string; title: string; is_completed: boolean; due_date: string | null; completed_at: string | null };

const defaultOpeningHours: Record<string, string> = { '1': '09:00-19:00', '2': '09:00-19:00', '3': '09:00-19:00', '4': '09:00-19:00', '5': '09:00-19:00', '6': '09:00-19:00', '7': 'closed' };
const openingDays = [{ key: '1', label: 'Pazartesi' }, { key: '2', label: 'Salı' }, { key: '3', label: 'Çarşamba' }, { key: '4', label: 'Perşembe' }, { key: '5', label: 'Cuma' }, { key: '6', label: 'Cumartesi' }, { key: '7', label: 'Pazar' }];

const tabs: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Genel bakış' }, { id: 'profile', label: 'İşletme bilgileri' },
  { id: 'services', label: 'Hizmetler & fiyatlar' }, { id: 'reviews', label: 'Yorumlar & puanlar' },
  { id: 'gallery', label: 'Fotoğraf galerisi' }, { id: 'appointments', label: 'Randevular' }, { id: 'maintenance', label: 'Bakım kontrol listesi' },
];

export default function AdminPage({ businessSlug = 'noir-barber' }: { businessSlug?: string }) {
  const [sessionReady, setSessionReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [business, setBusiness] = useState<Business | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [services, setServices] = useState<Service[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [gallery, setGallery] = useState<Gallery[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [maintenanceTasks, setMaintenanceTasks] = useState<MaintenanceTask[]>([]);
  const [maintenanceTitle, setMaintenanceTitle] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [serviceName, setServiceName] = useState('');
  const [servicePrice, setServicePrice] = useState('450');
  const [serviceDuration, setServiceDuration] = useState('30');
  const [editingService, setEditingService] = useState<string | null>(null);
  const [editServiceName, setEditServiceName] = useState('');
  const [editServicePrice, setEditServicePrice] = useState('');
  const [editServiceDuration, setEditServiceDuration] = useState('');
  const [reviewName, setReviewName] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState('5');
  const [editingReview, setEditingReview] = useState<string | null>(null);
  const [editReviewName, setEditReviewName] = useState('');
  const [editReviewText, setEditReviewText] = useState('');
  const [editReviewRating, setEditReviewRating] = useState('5');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageAlt, setImageAlt] = useState('');
  const [profile, setProfile] = useState({ name: '', phone: '', address: '', instagram_url: '', google_maps_url: '', description: '', is_published: false });
  const [openingHours, setOpeningHours] = useState<Record<string, string>>(defaultOpeningHours);

  async function loadBusiness() {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setBusiness(null); return; }
    const { data, error } = await supabase.from('businesses').select('*').eq('slug', businessSlug).single();
    if (error || !data) { setNotice('İşletme bulunamadı veya bu hesap için yetki tanımlanmamış. Supabase kurulum adımlarını kontrol et.'); return; }
    const b = data as Business;
    setBusiness(b);
    setProfile({ name: b.name || '', phone: b.phone || '', address: b.address || '', instagram_url: b.instagram_url || '', google_maps_url: b.google_maps_url || '', description: b.description || '', is_published: !!b.is_published });
    setOpeningHours({ ...defaultOpeningHours, ...(b.opening_hours || {}) });
    const [s,r,g,a,m] = await Promise.all([
      supabase.from('services').select('*').eq('business_id', b.id).order('name'),
      supabase.from('customer_reviews').select('*').eq('business_id', b.id).order('created_at', { ascending: false }),
      supabase.from('gallery_images').select('*').eq('business_id', b.id).order('sort_order'),
      supabase.from('appointments').select('*').eq('business_id', b.id).order('starts_at', { ascending: false }).limit(100),
      supabase.from('maintenance_tasks').select('*').eq('business_id', b.id).order('created_at', { ascending: false }),
    ]);
    if (s.data) setServices(s.data as Service[]);
    if (r.data) setReviews(r.data as Review[]);
    if (g.data) setGallery(g.data as Gallery[]);
    if (a.data) setAppointments(a.data as Appointment[]);
    if (m.data) setMaintenanceTasks(m.data as MaintenanceTask[]);
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
  async function enableOwnerNotifications() {
    if (!supabase) return;
    try {
      const subscription = await requestBrowserPushSubscription();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Oturum süresi dolmuş. Yeniden giriş yap.');
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role: 'owner', businessSlug, subscription }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Bildirim aboneliği kaydedilemedi.');
      setNotice('Yeni randevu bildirimleri bu cihazda etkin.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Bildirimler açılamadı.');
    }
  }

  async function signOut() { if (supabase) await supabase.auth.signOut(); setBusiness(null); }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault(); if (!supabase || !business) return;
    setBusy(true);
    for (const day of openingDays) {
      const value = (openingHours[day.key] || 'closed').trim();
      if (value !== 'closed' && !/^(?:[01]\\d|2[0-3]):[0-5]\\d-(?:[01]\\d|2[0-3]):[0-5]\\d$/.test(value)) {
        setNotice(day.label + ' için saat biçimi geçersiz. Örnek: 09:00-19:00 veya closed.');
        setBusy(false);
        return;
      }
    }
    const { error } = await supabase.from('businesses').update({ ...profile, opening_hours: openingHours }).eq('id', business.id);
    setNotice(error ? 'Kaydedilemedi: ' + error.message : 'İşletme bilgileri kaydedildi.');
    setBusy(false); if (!error) await loadBusiness();
  }
  async function addService(e: React.FormEvent) {
    e.preventDefault(); if (!supabase || !business) return;
    const { error } = await supabase.from('services').insert({ business_id: business.id, name: serviceName.trim(), price: Number(servicePrice), duration_minutes: Number(serviceDuration), is_active: true });
    setNotice(error ? 'Hizmet eklenemedi: ' + error.message : 'Hizmet eklendi.');
    if (!error) { setServiceName(''); await loadBusiness(); }
  }
  function startServiceEdit(item: Service) {
    setEditingService(item.id);
    setEditServiceName(item.name);
    setEditServicePrice(String(item.price));
    setEditServiceDuration(String(item.duration_minutes));
  }
  async function saveServiceEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || !business || !editingService) return;
    const price = Number(editServicePrice);
    const duration = Number(editServiceDuration);
    if (!editServiceName.trim() || !Number.isFinite(price) || price < 0 || !Number.isInteger(duration) || duration < 5 || duration > 480) {
      setNotice('Hizmet adı, fiyat veya süre geçersiz.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('services')
      .update({ name: editServiceName.trim(), price, duration_minutes: duration })
      .eq('id', editingService)
      .eq('business_id', business.id);
    setNotice(error ? 'Hizmet güncellenemedi: ' + error.message : 'Hizmet güncellendi.');
    setBusy(false);
    if (!error) {
      setEditingService(null);
      await loadBusiness();
    }
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
  function startReviewEdit(item: Review) {
    setEditingReview(item.id);
    setEditReviewName(item.customer_name);
    setEditReviewText(item.review_text);
    setEditReviewRating(String(item.rating));
  }
  async function saveReviewEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || !business || !editingReview) return;
    const rating = Number(editReviewRating);
    if (editReviewName.trim().length < 2 || editReviewText.trim().length < 2 || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      setNotice('Yorum adı, metni veya puanı geçersiz.');
      return;
    }
    const { error } = await supabase.from('customer_reviews').update({
      customer_name: editReviewName.trim(),
      review_text: editReviewText.trim(),
      rating,
    }).eq('id', editingReview).eq('business_id', business.id);
    setNotice(error ? 'Yorum güncellenemedi: ' + error.message : 'Yorum güncellendi.');
    if (!error) { setEditingReview(null); await loadBusiness(); }
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
    e.preventDefault();
    if (!supabase || !business || !imageFile) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(imageFile.type)) {
      setNotice('Yalnızca JPG, PNG veya WebP fotoğraf yükleyebilirsin.');
      return;
    }
    if (imageFile.size > 5 * 1024 * 1024) {
      setNotice('Fotoğraf en fazla 5 MB olabilir.');
      return;
    }
    setBusy(true);
    const safeName = imageFile.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const storagePath = `${business.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from('business-gallery')
      .upload(storagePath, imageFile, {
        cacheControl: '3600',
        contentType: imageFile.type,
        upsert: false,
      });
    if (uploadError) {
      setNotice('Fotoğraf yüklenemedi: ' + uploadError.message);
      setBusy(false);
      return;
    }
    const { data: publicData } = supabase.storage.from('business-gallery').getPublicUrl(storagePath);
    const { error: insertError } = await supabase.from('gallery_images').insert({
      business_id: business.id,
      image_url: publicData.publicUrl,
      storage_path: storagePath,
      alt_text: imageAlt.trim(),
      is_published: true,
      sort_order: gallery.length,
    });
    if (insertError) {
      await supabase.storage.from('business-gallery').remove([storagePath]);
      setNotice('Fotoğraf kaydı oluşturulamadı: ' + insertError.message);
    } else {
      setNotice('Fotoğraf eklendi.');
      setImageFile(null);
      setImageAlt('');
      await loadBusiness();
    }
    setBusy(false);
  }
  async function deleteImage(item: Gallery) {
    if (!supabase || !window.confirm('Bu fotoğraf galeriden kaldırılsın mı?')) return;
    if (item.storage_path) {
      const { error: storageError } = await supabase.storage.from('business-gallery').remove([item.storage_path]);
      if (storageError) {
        setNotice('Fotoğraf dosyası silinemedi: ' + storageError.message);
        return;
      }
    }
    const { error } = await supabase.from('gallery_images').delete().eq('id', item.id);
    setNotice(error ? 'Fotoğraf kaydı silinemedi: ' + error.message : 'Fotoğraf kaldırıldı.');
    if (!error) await loadBusiness();
  }
  async function moveImage(item: Gallery, direction: -1 | 1) {
    if (!supabase) return;
    const currentIndex = gallery.findIndex(image => image.id === item.id);
    const target = gallery[currentIndex + direction];
    if (!target) return;
    const updates = await Promise.all([
      supabase.from('gallery_images').update({ sort_order: target.sort_order }).eq('id', item.id),
      supabase.from('gallery_images').update({ sort_order: item.sort_order }).eq('id', target.id),
    ]);
    const error = updates.find(result => result.error)?.error;
    setNotice(error ? 'Fotoğraf sırası değiştirilemedi: ' + error.message : 'Fotoğraf sırası güncellendi.');
    if (!error) await loadBusiness();
  }
  async function addMaintenanceTask(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || !business || maintenanceTitle.trim().length < 2) return;
    const { error } = await supabase.from('maintenance_tasks').insert({
      business_id: business.id,
      title: maintenanceTitle.trim(),
    });
    setNotice(error ? 'Kontrol maddesi eklenemedi: ' + error.message : 'Kontrol maddesi eklendi.');
    if (!error) { setMaintenanceTitle(''); await loadBusiness(); }
  }
  async function toggleMaintenanceTask(item: MaintenanceTask) {
    if (!supabase) return;
    const next = !item.is_completed;
    const { error } = await supabase.from('maintenance_tasks').update({
      is_completed: next,
      completed_at: next ? new Date().toISOString() : null,
    }).eq('id', item.id);
    setNotice(error ? 'Görev güncellenemedi: ' + error.message : 'Bakım listesi güncellendi.');
    if (!error) await loadBusiness();
  }
  async function deleteMaintenanceTask(id: string) {
    if (!supabase || !window.confirm('Bu kontrol maddesi silinsin mi?')) return;
    const { error } = await supabase.from('maintenance_tasks').delete().eq('id', id);
    setNotice(error ? 'Kontrol maddesi silinemedi: ' + error.message : 'Kontrol maddesi silindi.');
    if (!error) await loadBusiness();
  }

  async function setAppointmentStatus(item: Appointment, status: string) {
    if (!supabase) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) { setNotice('Oturum süresi dolmuş. Yeniden giriş yap.'); return; }
    const response = await fetch(`/api/admin/appointments/${item.id}/status`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    const result = await response.json();
    setNotice(!response.ok ? (result.error || 'Randevu güncellenemedi.') : 'Randevu durumu güncellendi.');
    if (response.ok) await loadBusiness();
  }

  if (!sessionReady) return <main className="admin-page"><p>Yönetim paneli yükleniyor…</p></main>;
  if (!supabase) return <main className="admin-page"><section className="admin-login"><h1>NOIR / Yönetim</h1><p>Supabase bağlantısı bulunamadı. Ortam değişkenlerini ayarlamadan yönetim paneli kullanılamaz.</p><code>NEXT_PUBLIC_SUPABASE_URL</code><code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code></section></main>;
  if (!business) return <main className="admin-page"><form className="admin-login" onSubmit={signIn}><a className="admin-back" href="/">← Siteye dön</a><div className="eyebrow dark-eyebrow">NOIR / SECURE ACCESS</div><h1>Yönetici girişi</h1><p>İşletme hesabınla giriş yap.</p><label>E-posta<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} /></label><label>Şifre<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} /></label><button className="button button-dark" disabled={busy}>{busy ? 'Giriş yapılıyor…' : 'Giriş yap'}</button>{notice && <p className="admin-notice">{notice}</p>}<small>Hesap oluşturma herkese açık değildir. İşletme sahibi hesabı Supabase üzerinden yetkilendirilmelidir.</small></form></main>;

  return <main className="admin-page"><header className="admin-header"><a className="brand" href="/"><span className="brand-mark">N</span><span>NOIR<span className="brand-light">BARBER</span></span></a><div><span>{business.name}</span><button onClick={enableOwnerNotifications}>Bildirimleri aç</button><button onClick={signOut}>Çıkış yap</button></div></header><div className="admin-layout"><aside className="admin-sidebar"><div className="admin-kicker">İŞLETME YÖNETİMİ</div>{tabs.map(item=><button key={item.id} className={tab===item.id?'selected':''} onClick={()=>setTab(item.id)}>{item.label}</button>)}</aside><section className="admin-content"><div className="admin-title"><div className="eyebrow dark-eyebrow">NOIR / CONTROL CENTER</div><h1>{tabs.find(x=>x.id===tab)?.label}</h1><p>İçerik ve işletme ayarlarını buradan yönet.</p></div>{notice && <div className="admin-notice">{notice}</div>}
{tab==='overview' && <div className="admin-stats"><article><strong>{appointments.filter(x=>x.status==='pending').length}</strong><span>Bekleyen randevu</span></article><article><strong>{services.filter(x=>x.is_active).length}</strong><span>Aktif hizmet</span></article><article><strong>{reviews.filter(x=>x.is_published).length}</strong><span>Yayındaki yorum</span></article><article><strong>{gallery.length}</strong><span>Galeri fotoğrafı</span></article></div>}
{tab==='profile' && <form className="admin-card admin-fields" onSubmit={saveProfile}><label>İşletme adı<input required value={profile.name} onChange={e=>setProfile({...profile,name:e.target.value})}/></label><label>Telefon<input value={profile.phone} onChange={e=>setProfile({...profile,phone:e.target.value})}/></label><label>Adres<input value={profile.address} onChange={e=>setProfile({...profile,address:e.target.value})}/></label><label>Instagram bağlantısı<input value={profile.instagram_url} onChange={e=>setProfile({...profile,instagram_url:e.target.value})}/></label><label>Google Maps bağlantısı<input value={profile.google_maps_url} onChange={e=>setProfile({...profile,google_maps_url:e.target.value})}/></label><label className="wide">Hakkımızda metni<textarea rows={4} value={profile.description} onChange={e=>setProfile({...profile,description:e.target.value})}/></label><div className="wide opening-hours-editor"><strong>Çalışma saatleri</strong><small>Örnek: 09:00-19:00. Kapalı günler için closed yaz.</small>{openingDays.map(day=><label key={day.key}>{day.label}<input value={openingHours[day.key] || 'closed'} onChange={e=>setOpeningHours(current=>({...current,[day.key]:e.target.value}))} placeholder="09:00-19:00 veya closed"/></label>)}</div><label className="wide admin-publish"><input type="checkbox" checked={profile.is_published} onChange={e=>setProfile({...profile,is_published:e.target.checked})}/> Siteyi herkese açık yayınla</label><button className="button button-dark" disabled={busy}>Bilgileri kaydet</button></form>}
{tab==='services' && <><form className="admin-card admin-fields" onSubmit={addService}><label>Hizmet adı<input required value={serviceName} onChange={e=>setServiceName(e.target.value)}/></label><label>Fiyat (₺)<input required type="number" min="0" value={servicePrice} onChange={e=>setServicePrice(e.target.value)}/></label><label>Süre (dakika)<input required type="number" min="5" max="480" value={serviceDuration} onChange={e=>setServiceDuration(e.target.value)}/></label><button className="button button-dark">Hizmet ekle</button></form><div className="admin-list">{services.map(item=><article key={item.id}>{editingService===item.id ? <form className="service-edit" onSubmit={saveServiceEdit}><input aria-label="Hizmet adı" required value={editServiceName} onChange={e=>setEditServiceName(e.target.value)}/><input aria-label="Fiyat" type="number" min="0" required value={editServicePrice} onChange={e=>setEditServicePrice(e.target.value)}/><input aria-label="Süre dakika" type="number" min="5" max="480" required value={editServiceDuration} onChange={e=>setEditServiceDuration(e.target.value)}/><button disabled={busy}>Kaydet</button><button type="button" onClick={()=>setEditingService(null)}>Vazgeç</button></form> : <div><strong>{item.name}</strong><span>{item.price} ₺ · {item.duration_minutes} dk · {item.is_active?'Aktif':'Gizli'}</span></div>}<button onClick={()=>startServiceEdit(item)}>Düzenle</button><button onClick={()=>toggleService(item)}>{item.is_active?'Gizle':'Yayınla'}</button><button className="danger" onClick={()=>deleteService(item.id)}>Sil</button></article>)}</div></>}
{tab==='reviews' && <><form className="admin-card admin-fields" onSubmit={addReview}><label>Müşteri adı<input required value={reviewName} onChange={e=>setReviewName(e.target.value)}/></label><label>Puan<select value={reviewRating} onChange={e=>setReviewRating(e.target.value)}>{[5,4,3,2,1].map(n=><option key={n} value={n}>{n} / 5</option>)}</select></label><label className="wide">Yorum<textarea required rows={3} value={reviewText} onChange={e=>setReviewText(e.target.value)}/></label><button className="button button-dark">Manuel yorum ekle</button><small className="wide">Yalnızca gerçek müşterilerden alınan ve paylaşım izni bulunan yorumları ekle. Manuel yorumlar Google yorumu olarak etiketlenmez.</small></form><div className="admin-list">{reviews.map(item=><article key={item.id}>{editingReview===item.id ? <form className="review-edit" onSubmit={saveReviewEdit}><input aria-label="Müşteri adı" required value={editReviewName} onChange={e=>setEditReviewName(e.target.value)}/><select aria-label="Puan" value={editReviewRating} onChange={e=>setEditReviewRating(e.target.value)}>{[5,4,3,2,1].map(n=><option key={n} value={n}>{n} / 5</option>)}</select><textarea aria-label="Yorum" required rows={3} value={editReviewText} onChange={e=>setEditReviewText(e.target.value)}/><button>Kaydet</button><button type="button" onClick={()=>setEditingReview(null)}>Vazgeç</button></form> : <div><strong>{item.customer_name} · {'★'.repeat(item.rating)}</strong><span>{item.review_text}</span><small>{item.source==='google'?'Google kaynağı':'Manuel ekleme'}</small></div>}<button onClick={()=>startReviewEdit(item)}>Düzenle</button><button onClick={()=>toggleReview(item)}>{item.is_published?'Gizle':'Yayınla'}</button><button className="danger" onClick={()=>deleteReview(item.id)}>Sil</button></article>)}</div></>}
{tab==='gallery' && <><form className="admin-card admin-fields" onSubmit={addImage}><label className="wide">Bilgisayarından fotoğraf seç<input type="file" accept="image/jpeg,image/png,image/webp" required onChange={e=>setImageFile(e.target.files?.[0] || null)}/></label><label className="wide">Fotoğraf açıklaması<input value={imageAlt} onChange={e=>setImageAlt(e.target.value)} placeholder="Örn. Salon içi"/></label><button className="button button-dark" disabled={busy || !imageFile}>{busy ? 'Yükleniyor…' : 'Fotoğraf yükle'}</button><small className="wide">JPG, PNG veya WebP · En fazla 5 MB. Fotoğraflar güvenli şekilde işletmenin galerisine yüklenir.</small></form><div className="admin-gallery">{gallery.map((item,index)=><article key={item.id}><img src={item.image_url} alt={item.alt_text}/><div><span>{item.alt_text || 'Galeri görseli'}</span><button disabled={index===0} onClick={()=>moveImage(item,-1)}>↑</button><button disabled={index===gallery.length-1} onClick={()=>moveImage(item,1)}>↓</button><button className="danger" onClick={()=>deleteImage(item)}>Kaldır</button></div></article>)}</div></>}
{tab==='maintenance' && <><form className="admin-card admin-fields" onSubmit={addMaintenanceTask}><label className="wide">Yeni bakım kontrol maddesi<input required minLength={2} maxLength={120} value={maintenanceTitle} onChange={e=>setMaintenanceTitle(e.target.value)} placeholder="Örn. Makasları dezenfekte et"/></label><button className="button button-dark">Listeye ekle</button></form><div className="admin-list">{maintenanceTasks.length===0 && <p>Henüz bakım maddesi eklenmedi.</p>}{maintenanceTasks.map(item=><article key={item.id}><div><strong>{item.title}</strong><span>{item.is_completed?'Tamamlandı':'Bekliyor'}{item.completed_at ? ' · '+new Date(item.completed_at).toLocaleDateString('tr-TR') : ''}</span></div><button onClick={()=>toggleMaintenanceTask(item)}>{item.is_completed?'Geri al':'Tamamlandı'}</button><button className="danger" onClick={()=>deleteMaintenanceTask(item.id)}>Sil</button></article>)}</div></>}
{tab==='appointments' && <div className="admin-list">{appointments.length===0 && <p>Henüz randevu kaydı yok.</p>}{appointments.map(item=><article key={item.id}><div><strong>{item.customer_name} · {item.service_name}</strong><span>{item.customer_phone} · {new Date(item.starts_at).toLocaleString('tr-TR')}</span><small>Durum: {item.status}</small></div><button onClick={()=>setAppointmentStatus(item,'confirmed')}>Onayla</button><button onClick={()=>setAppointmentStatus(item,'rejected')}>Reddet</button><button onClick={()=>setAppointmentStatus(item,'completed')}>Tamamlandı</button><button className="danger" onClick={()=>setAppointmentStatus(item,'cancelled')}>İptal et</button></article>)}</div>}
</section></div></main>;
}
