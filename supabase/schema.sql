-- NOIR BARBER multi-tenant starter schema.
-- Run in Supabase SQL Editor after creating a project.
create extension if not exists pgcrypto;
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  timezone text not null default 'Europe/Istanbul',
  created_at timestamptz not null default now()
);
create table if not exists public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','staff')),
  primary key (business_id,user_id)
);
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null check (price >= 0),
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  is_active boolean not null default true
);
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  service_id uuid references public.services(id) on delete set null,
  service_name text not null,
  starts_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists appointments_business_start on public.appointments(business_id,starts_at);

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.services enable row level security;
alter table public.appointments enable row level security;

-- Public can read active service menus. Only business members can manage them.
create policy "public reads active services" on public.services for select using (is_active = true);
create policy "members manage services" on public.services for all to authenticated
using (exists(select 1 from public.business_members m where m.business_id=services.business_id and m.user_id=auth.uid()))
with check (exists(select 1 from public.business_members m where m.business_id=services.business_id and m.user_id=auth.uid()));
create policy "members read own business" on public.businesses for select to authenticated
using (exists(select 1 from public.business_members m where m.business_id=businesses.id and m.user_id=auth.uid()));
create policy "members read memberships" on public.business_members for select to authenticated using (user_id=auth.uid());
create policy "members read own appointments" on public.appointments for select to authenticated
using (exists(select 1 from public.business_members m where m.business_id=appointments.business_id and m.user_id=auth.uid()));
create policy "members update own appointments" on public.appointments for update to authenticated
using (exists(select 1 from public.business_members m where m.business_id=appointments.business_id and m.user_id=auth.uid()))
with check (exists(select 1 from public.business_members m where m.business_id=appointments.business_id and m.user_id=auth.uid()));

-- IMPORTANT: Do not enable public INSERT on appointments in production.
-- Public booking should go through a server-side API/Edge Function that validates
-- business slug, opening hours, service duration, availability and rate limits.
-- Enforce overlap prevention transactionally (e.g. exclusion constraint on a
-- generated tstzrange for active bookings) before accepting live reservations.
