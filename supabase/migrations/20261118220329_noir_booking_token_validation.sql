create or replace function public.create_public_appointment(
  p_customer_name text,
  p_customer_phone text,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_notification_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_timezone text;
  v_service_name text;
  v_duration integer;
  v_local_start timestamp;
  v_local_date date;
  v_local_time time;
  v_appointment_id uuid;
begin
  if length(trim(coalesce(p_customer_name, ''))) < 2
     or length(trim(coalesce(p_customer_name, ''))) > 80
     or length(trim(coalesce(p_customer_phone, ''))) < 10
     or length(trim(coalesce(p_customer_phone, ''))) > 24
     or p_starts_at is null
     or p_notification_token_hash is null
     or p_notification_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Lütfen geçerli ad, telefon ve saat bilgisi gir.';
  end if;
  select b.id,b.timezone into v_business_id,v_timezone
  from public.businesses b where b.slug='noir-barber' and b.is_published=true for update;
  if v_business_id is null then raise exception 'İşletme şu anda randevu kabul etmiyor.'; end if;
  select s.name,s.duration_minutes into v_service_name,v_duration
  from public.services s where s.id=p_service_id and s.business_id=v_business_id and s.is_active=true;
  if v_duration is null then raise exception 'Seçilen hizmet artık mevcut değil.'; end if;
  v_local_start := p_starts_at at time zone v_timezone;
  v_local_date := v_local_start::date;
  v_local_time := v_local_start::time;
  if p_starts_at <= now()
     or v_local_date > (now() at time zone v_timezone)::date + 60
     or extract(isodow from v_local_date) not between 1 and 6
     or v_local_time not in (time '09:00',time '10:00',time '11:00',time '13:00',time '14:00',time '15:00',time '16:00',time '17:00',time '18:00')
     or v_local_time + make_interval(mins => v_duration) > time '19:00' then
    raise exception 'Seçilen tarih veya saat çalışma saatleri dışında.';
  end if;
  if exists(select 1 from public.appointments a where a.business_id=v_business_id
    and a.status in ('pending','confirmed')
    and a.starts_at < p_starts_at + make_interval(mins => v_duration)
    and a.starts_at + make_interval(mins => a.duration_minutes) > p_starts_at) then
    raise exception 'Bu saat az önce doldu. Lütfen başka bir saat seç.';
  end if;
  insert into public.appointments(business_id,customer_name,customer_phone,service_id,service_name,starts_at,duration_minutes,status,notification_token_hash)
  values(v_business_id,trim(p_customer_name),trim(p_customer_phone),p_service_id,v_service_name,p_starts_at,v_duration,'pending',p_notification_token_hash)
  returning id into v_appointment_id;
  return jsonb_build_object('id',v_appointment_id,'status','pending');
end;
$$;
