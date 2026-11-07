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


-- Production content management: public visitors can read published content;
-- only authenticated business members can create, edit or delete it.
alter table public.businesses
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists instagram_url text,
  add column if not exists google_maps_url text,
  add column if not exists google_place_id text,
  add column if not exists opening_hours jsonb not null default '{}'::jsonb,
  add column if not exists description text,
  add column if not exists logo_url text,
  add column if not exists cover_url text,
  add column if not exists is_published boolean not null default false;

create table if not exists public.site_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  hero_title text not null default '',
  hero_subtitle text not null default '',
  about_title text not null default '',
  about_text text not null default '',
  primary_color text not null default '#171717',
  accent_color text not null default '#b99a65',
  updated_at timestamptz not null default now()
);

create table if not exists public.gallery_images (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  image_url text not null,
  alt_text text not null default '',
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists gallery_business_sort on public.gallery_images(business_id,sort_order);

create table if not exists public.customer_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_name text not null,
  review_text text not null,
  rating smallint not null check (rating between 1 and 5),
  source text not null default 'manual' check (source in ('manual','google')),
  source_url text,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists reviews_business_created on public.customer_reviews(business_id,created_at desc);

alter table public.site_settings enable row level security;
alter table public.gallery_images enable row level security;
alter table public.customer_reviews enable row level security;

drop policy if exists "public reads published business profiles" on public.businesses;
create policy "public reads published business profiles" on public.businesses
  for select using (is_published = true);

drop policy if exists "members manage own business profile" on public.businesses;
create policy "members manage own business profile" on public.businesses
  for update to authenticated
  using (exists(select 1 from public.business_members m where m.business_id=businesses.id and m.user_id=auth.uid()))
  with check (exists(select 1 from public.business_members m where m.business_id=businesses.id and m.user_id=auth.uid()));

drop policy if exists "public reads site settings" on public.site_settings;
create policy "public reads site settings" on public.site_settings
  for select using (true);
drop policy if exists "members manage site settings" on public.site_settings;
create policy "members manage site settings" on public.site_settings
  for all to authenticated
  using (exists(select 1 from public.business_members m where m.business_id=site_settings.business_id and m.user_id=auth.uid()))
  with check (exists(select 1 from public.business_members m where m.business_id=site_settings.business_id and m.user_id=auth.uid()));

drop policy if exists "public reads published gallery" on public.gallery_images;
create policy "public reads published gallery" on public.gallery_images
  for select using (is_published = true);
drop policy if exists "members manage gallery" on public.gallery_images;
create policy "members manage gallery" on public.gallery_images
  for all to authenticated
  using (exists(select 1 from public.business_members m where m.business_id=gallery_images.business_id and m.user_id=auth.uid()))
  with check (exists(select 1 from public.business_members m where m.business_id=gallery_images.business_id and m.user_id=auth.uid()));

drop policy if exists "public reads published reviews" on public.customer_reviews;
create policy "public reads published reviews" on public.customer_reviews
  for select using (is_published = true);
drop policy if exists "members manage reviews" on public.customer_reviews;
create policy "members manage reviews" on public.customer_reviews
  for all to authenticated
  using (exists(select 1 from public.business_members m where m.business_id=customer_reviews.business_id and m.user_id=auth.uid()))
  with check (exists(select 1 from public.business_members m where m.business_id=customer_reviews.business_id and m.user_id=auth.uid()));

-- IMPORTANT SETUP:
-- 1. Create the first owner account in Supabase Authentication.
-- 2. Create a businesses row for the shop and add that auth user to business_members
--    with role='owner'. Never expose a service-role key in NEXT_PUBLIC_* variables.
-- 3. Create a private 'business-media' storage bucket. Add authenticated member-only
--    upload/update/delete policies scoped to the business. Do not make the bucket public
--    for writes; public image delivery can use signed URLs or a public read policy.
-- 4. Public appointment inserts must use a server-side endpoint with validation,
--    rate limiting and transactional overlap prevention. Do not add an anon INSERT policy.
