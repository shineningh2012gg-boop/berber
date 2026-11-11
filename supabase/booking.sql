-- Public booking RPCs for NOIR BARBER.
-- Run once in Supabase SQL Editor. No service-role key is needed by the website.
alter table public.appointments
  add column if not exists notification_token_hash text;

create unique index if not exists appointments_notification_token_hash_idx
  on public.appointments (notification_token_hash)
  where notification_token_hash is not null;
create or replace function public.get_public_available_slots(
  p_date date,
  p_service_id uuid
)
returns table(slot_start time)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_timezone text;
  v_duration integer;
  v_slot time;
  v_start timestamptz;
begin
  select b.id, b.timezone
    into v_business_id, v_timezone
  from public.businesses b
  where b.slug = 'noir-barber' and b.is_published = true;

  if v_business_id is null then
    return;
  end if;

  select s.duration_minutes into v_duration
  from public.services s
  where s.id = p_service_id
    and s.business_id = v_business_id
    and s.is_active = true;

  if v_duration is null or p_date < (now() at time zone v_timezone)::date
     or p_date > (now() at time zone v_timezone)::date + 60
     or extract(isodow from p_date) not between 1 and 6 then
    return;
  end if;

  for v_slot in
    select x from unnest(array[
      time '09:00', time '10:00', time '11:00',
      time '13:00', time '14:00', time '15:00',
      time '16:00', time '17:00', time '18:00'
    ]) as x
  loop
    v_start := (p_date + v_slot) at time zone v_timezone;
    if v_start > now()
       and v_slot + make_interval(mins => v_duration) <= time '19:00'
       and not exists (
         select 1 from public.appointments a
         where a.business_id = v_business_id
           and a.status in ('pending','confirmed')
           and a.starts_at < v_start + make_interval(mins => v_duration)
           and a.starts_at + make_interval(mins => a.duration_minutes) > v_start
       ) then
      slot_start := v_slot;
      return next;
    end if;
  end loop;
end;
$$;

drop function if exists public.create_public_appointment(text, text, uuid, timestamptz);

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
  if length(trim(coalesce(p_customer_name,''))) < 2
     or length(trim(coalesce(p_customer_name,''))) > 80
     or length(trim(coalesce(p_customer_phone,''))) < 10
     or length(trim(coalesce(p_customer_phone,''))) > 24
     or p_starts_at is null
     or p_notification_token_hash !~ '^[0-9a-f]{64}
    raise exception 'Lütfen geçerli ad, telefon ve saat bilgisi gir.';
  end if;

  -- Serializes booking attempts for this business to prevent simultaneous overlaps.
  select b.id, b.timezone into v_business_id, v_timezone
  from public.businesses b
  where b.slug = 'noir-barber' and b.is_published = true
  for update;

  if v_business_id is null then
    raise exception 'İşletme şu anda randevu kabul etmiyor.';
  end if;

  select s.name, s.duration_minutes into v_service_name, v_duration
  from public.services s
  where s.id = p_service_id
    and s.business_id = v_business_id
    and s.is_active = true;

  if v_duration is null then
    raise exception 'Seçilen hizmet artık mevcut değil.';
  end if;

  v_local_start := p_starts_at at time zone v_timezone;
  v_local_date := v_local_start::date;
  v_local_time := v_local_start::time;

  if p_starts_at <= now()
     or v_local_date > (now() at time zone v_timezone)::date + 60
     or extract(isodow from v_local_date) not between 1 and 6
     or v_local_time not in (
       time '09:00', time '10:00', time '11:00',
       time '13:00', time '14:00', time '15:00',
       time '16:00', time '17:00', time '18:00'
     )
     or v_local_time + make_interval(mins => v_duration) > time '19:00' then
    raise exception 'Seçilen tarih veya saat çalışma saatleri dışında.';
  end if;

  if exists (
    select 1 from public.appointments a
    where a.business_id = v_business_id
      and a.status in ('pending','confirmed')
      and a.starts_at < p_starts_at + make_interval(mins => v_duration)
      and a.starts_at + make_interval(mins => a.duration_minutes) > p_starts_at
  ) then
    raise exception 'Bu saat az önce doldu. Lütfen başka bir saat seç.';
  end if;

  insert into public.appointments (
    business_id, customer_name, customer_phone,
    service_id, service_name, starts_at, duration_minutes, status,
    notification_token_hash
  ) values (
    v_business_id, trim(p_customer_name), trim(p_customer_phone),
    p_service_id, v_service_name, p_starts_at, v_duration, 'pending',
    p_notification_token_hash
  ) returning id into v_appointment_id;

  return jsonb_build_object('id', v_appointment_id, 'status', 'pending');
end;
$$;

revoke all on function public.get_public_available_slots(date, uuid) from public;
revoke all on function public.create_public_appointment(text, text, uuid, timestamptz, text) from public;
grant execute on function public.get_public_available_slots(date, uuid) to anon, authenticated;
grant execute on function public.create_public_appointment(text, text, uuid, timestamptz, text) to anon, authenticated;
 then
    raise exception 'Lütfen geçerli ad, telefon ve saat bilgisi gir.';
  end if;

  -- Serializes booking attempts for this business to prevent simultaneous overlaps.
  select b.id, b.timezone into v_business_id, v_timezone
  from public.businesses b
  where b.slug = 'noir-barber' and b.is_published = true
  for update;

  if v_business_id is null then
    raise exception 'İşletme şu anda randevu kabul etmiyor.';
  end if;

  select s.name, s.duration_minutes into v_service_name, v_duration
  from public.services s
  where s.id = p_service_id
    and s.business_id = v_business_id
    and s.is_active = true;

  if v_duration is null then
    raise exception 'Seçilen hizmet artık mevcut değil.';
  end if;

  v_local_start := p_starts_at at time zone v_timezone;
  v_local_date := v_local_start::date;
  v_local_time := v_local_start::time;

  if p_starts_at <= now()
     or v_local_date > (now() at time zone v_timezone)::date + 60
     or extract(isodow from v_local_date) not between 1 and 6
     or v_local_time not in (
       time '09:00', time '10:00', time '11:00',
       time '13:00', time '14:00', time '15:00',
       time '16:00', time '17:00', time '18:00'
     )
     or v_local_time + make_interval(mins => v_duration) > time '19:00' then
    raise exception 'Seçilen tarih veya saat çalışma saatleri dışında.';
  end if;

  if exists (
    select 1 from public.appointments a
    where a.business_id = v_business_id
      and a.status in ('pending','confirmed')
      and a.starts_at < p_starts_at + make_interval(mins => v_duration)
      and a.starts_at + make_interval(mins => a.duration_minutes) > p_starts_at
  ) then
    raise exception 'Bu saat az önce doldu. Lütfen başka bir saat seç.';
  end if;

  insert into public.appointments (
    business_id, customer_name, customer_phone,
    service_id, service_name, starts_at, duration_minutes, status
  ) values (
    v_business_id, trim(p_customer_name), trim(p_customer_phone),
    p_service_id, v_service_name, p_starts_at, v_duration, 'pending'
  ) returning id into v_appointment_id;

  return jsonb_build_object('id', v_appointment_id, 'status', 'pending');
end;
$$;

revoke all on function public.get_public_available_slots(date, uuid) from public;
revoke all on function public.create_public_appointment(text, text, uuid, timestamptz) from public;
grant execute on function public.get_public_available_slots(date, uuid) to anon, authenticated;
grant execute on function public.create_public_appointment(text, text, uuid, timestamptz) to anon, authenticated;
