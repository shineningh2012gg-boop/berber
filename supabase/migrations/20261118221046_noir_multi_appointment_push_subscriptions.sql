alter table public.push_subscriptions
  add column if not exists subscription_key text;

update public.push_subscriptions
set subscription_key = role || ':' ||
  coalesce(appointment_id::text, business_id::text) || ':' || md5(endpoint)
where subscription_key is null;

alter table public.push_subscriptions
  alter column subscription_key set not null;

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_endpoint_key;

create unique index if not exists push_subscriptions_subscription_key_idx
  on public.push_subscriptions (subscription_key);
