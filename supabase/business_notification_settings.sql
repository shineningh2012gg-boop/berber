-- Private notification email settings for each business.
-- Run once in the Supabase SQL Editor.
create table if not exists public.business_notification_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  notification_email text not null,
  updated_at timestamptz not null default now(),
  constraint business_notification_email_format check (
    notification_email ~* '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
  )
);

alter table public.business_notification_settings enable row level security;
revoke all on public.business_notification_settings from public, anon;
grant select, insert, update, delete on public.business_notification_settings to authenticated;
grant select on public.business_notification_settings to service_role;

drop policy if exists "business members manage notification email" on public.business_notification_settings;
create policy "business members manage notification email"
on public.business_notification_settings
for all
to authenticated
using (
  exists (
    select 1 from public.business_members m
    where m.business_id = business_notification_settings.business_id
      and m.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.business_members m
    where m.business_id = business_notification_settings.business_id
      and m.user_id = (select auth.uid())
  )
);
