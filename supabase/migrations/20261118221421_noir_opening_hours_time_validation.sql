create or replace function public.get_public_available_slots(
  p_date date, p_service_id uuid, p_business_slug text default 'noir-barber'
)
returns table(slot_start time)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid; v_timezone text; v_opening_hours jsonb; v_hours text;
  v_open time; v_close time; v_duration integer; v_slot time; v_start timestamptz;
begin
  select b.id,b.timezone,b.opening_hours into v_business_id,v_timezone,v_opening_hours
  from public.businesses b where b.slug=p_business_slug and b.is_published=true;
  if v_business_id is null then return; end if;
  select s.duration_minutes into v_duration from public.services s
  where s.id=p_service_id and s.business_id=v_business_id and s.is_active=true;
  if v_duration is null or p_date < (now() at time zone v_timezone)::date
     or p_date > (now() at time zone v_timezone)::date + 60 then return; end if;
  v_hours := v_opening_hours ->> (extract(isodow from p_date)::int)::text;
  if v_hours is null then v_hours := case when extract(isodow from p_date) between 1 and 6 then '09:00-19:00' else 'closed' end; end if;
  if lower(v_hours)='closed' or v_hours !~ '^([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9]$' then return; end if;
  v_open := split_part(v_hours,'-',1)::time;
  v_close := split_part(v_hours,'-',2)::time;
  if v_open >= v_close then return; end if;
  v_slot := v_open;
  while v_slot + make_interval(mins => v_duration) <= v_close loop
    if not ((v_slot < time '12:00' and v_slot + make_interval(mins => v_duration) > time '12:00')
            or (v_slot >= time '12:00' and v_slot < time '13:00')) then
      v_start := (p_date + v_slot) at time zone v_timezone;
      if v_start > now() and not exists (
        select 1 from public.appointments a where a.business_id=v_business_id
          and a.status in ('pending','confirmed')
          and a.starts_at < v_start + make_interval(mins => v_duration)
          and a.starts_at + make_interval(mins => a.duration_minutes) > v_start
      ) then slot_start:=v_slot; return next; end if;
    end if;
    v_slot := v_slot + interval '1 hour';
  end loop;
end;
$$;

create or replace function public.create_public_appointment(
  p_customer_name text,p_customer_phone text,p_service_id uuid,p_starts_at timestamptz,
  p_notification_token_hash text,p_business_slug text default 'noir-barber'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid; v_timezone text; v_opening_hours jsonb; v_hours text;
  v_open time; v_close time; v_service_name text; v_duration integer;
  v_local_start timestamp; v_local_date date; v_local_time time; v_appointment_id uuid;
begin
  if length(trim(coalesce(p_customer_name,''))) < 2 or length(trim(coalesce(p_customer_name,''))) > 80
     or length(trim(coalesce(p_customer_phone,''))) < 10 or length(trim(coalesce(p_customer_phone,''))) > 24
     or p_starts_at is null or p_notification_token_hash is null
     or p_notification_token_hash !~ '^[0-9a-f]{64}$'
     or p_business_slug is null or p_business_slug !~ '^[a-z0-9-]{2,60}$' then
    raise exception 'Lütfen geçerli ad, telefon ve randevu bilgisi gir.';
  end if;
  select b.id,b.timezone,b.opening_hours into v_business_id,v_timezone,v_opening_hours
  from public.businesses b where b.slug=p_business_slug and b.is_published=true for update;
  if v_business_id is null then raise exception 'İşletme şu anda randevu kabul etmiyor.'; end if;
  select s.name,s.duration_minutes into v_service_name,v_duration
  from public.services s where s.id=p_service_id and s.business_id=v_business_id and s.is_active=true;
  if v_duration is null then raise exception 'Seçilen hizmet artık mevcut değil.'; end if;
  v_local_start := p_starts_at at time zone v_timezone;
  v_local_date := v_local_start::date;
  v_local_time := v_local_start::time;
  v_hours := v_opening_hours ->> (extract(isodow from v_local_date)::int)::text;
  if v_hours is null then v_hours := case when extract(isodow from v_local_date) between 1 and 6 then '09:00-19:00' else 'closed' end; end if;
  if lower(v_hours)='closed' or v_hours !~ '^([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'İşletme bu gün kapalı.'; end if;
  v_open := split_part(v_hours,'-',1)::time;
  v_close := split_part(v_hours,'-',2)::time;
  if p_starts_at <= now() or v_local_date > (now() at time zone v_timezone)::date + 60
     or v_open >= v_close or v_local_time < v_open
     or v_local_time + make_interval(mins => v_duration) > v_close
     or mod(extract(epoch from (v_local_time-v_open))::int,3600) <> 0
     or (v_local_time < time '12:00' and v_local_time + make_interval(mins => v_duration) > time '12:00')
     or (v_local_time >= time '12:00' and v_local_time < time '13:00') then
    raise exception 'Seçilen tarih veya saat çalışma saatleri dışında.';
  end if;
  if exists (select 1 from public.appointments a where a.business_id=v_business_id
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
