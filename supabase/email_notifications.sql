-- Email notifications: store customer email and replace the public booking RPC.
-- Run this file once in the Supabase SQL Editor.
alter table public.appointments
  add column if not exists customer_email text;

drop function if exists public.create_public_appointment(text, text, uuid, timestamptz);

create function public.create_public_appointment(
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_service_id uuid,
  p_starts_at timestamptz
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
  if length(trim(coalesce(p_customer_name,''))) < 2
     or length(trim(coalesce(p_customer_name,''))) > 80
     or length(trim(coalesce(p_customer_phone,''))) < 10
     or length(trim(coalesce(p_customer_phone,''))) > 24
     or length(trim(coalesce(p_customer_email,''))) > 254
     or trim(coalesce(p_customer_email,'')) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or p_starts_at is null then
    raise exception 'Lütfen geçerli ad, telefon, e-posta ve saat bilgisi gir.';
  end if;

  select b.id, b.timezone into v_business_id, v_timezone
  from public.businesses b
  where b.slug = 'noir-barber' and b.is_published = true
  for update;

  if v_business_id is null then
    raise exception 'İşletme şu anda randevu kabul etmiyor.';
  end if;

  select s.name, s.duration_minutes into v_service_name, v_duration
  from public.services s
  where s.id = p_service_id and s.business_id = v_business_id and s.is_active = true;

  if v_duration is null then raise exception 'Seçilen hizmet artık mevcut değil.'; end if;

  v_local_start := p_starts_at at time zone v_timezone;
  v_local_date := v_local_start::date;
  v_local_time := v_local_start::time;

  if p_starts_at <= now()
     or v_local_date > (now() at time zone v_timezone)::date + 60
     or extract(isodow from v_local_date) not between 1 and 6
     or v_local_time not in (time '09:00', time '10:00', time '11:00', time '13:00', time '14:00', time '15:00', time '16:00', time '17:00', time '18:00')
     or v_local_time + make_interval(mins => v_duration) > time '19:00' then
    raise exception 'Seçilen tarih veya saat çalışma saatleri dışında.';
  end if;

  if exists (
    select 1 from public.appointments a
    where a.business_id = v_business_id and a.status in ('pending','confirmed')
      and a.starts_at < p_starts_at + make_interval(mins => v_duration)
      and a.starts_at + make_interval(mins => a.duration_minutes) > p_starts_at
  ) then
    raise exception 'Bu saat az önce doldu. Lütfen başka bir saat seç.';
  end if;

  insert into public.appointments (
    business_id, customer_name, customer_phone, customer_email,
    service_id, service_name, starts_at, duration_minutes, status
  ) values (
    v_business_id, trim(p_customer_name), trim(p_customer_phone), lower(trim(p_customer_email)),
    p_service_id, v_service_name, p_starts_at, v_duration, 'pending'
  ) returning id into v_appointment_id;

  return jsonb_build_object('id', v_appointment_id, 'status', 'pending');
end;
$$;

revoke all on function public.create_public_appointment(text, text, text, uuid, timestamptz) from public;
grant execute on function public.create_public_appointment(text, text, text, uuid, timestamptz) to anon, authenticated;
