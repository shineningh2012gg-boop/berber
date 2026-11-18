create table if not exists public.maintenance_tasks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 120),
  is_completed boolean not null default false,
  due_date date,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists maintenance_tasks_business_created_idx
  on public.maintenance_tasks (business_id, created_at desc);

alter table public.maintenance_tasks enable row level security;
grant select, insert, update, delete on public.maintenance_tasks to authenticated;

drop policy if exists "Members read own maintenance tasks" on public.maintenance_tasks;
create policy "Members read own maintenance tasks"
on public.maintenance_tasks for select to authenticated
using (exists (select 1 from public.business_members bm where bm.business_id=maintenance_tasks.business_id and bm.user_id=(select auth.uid())));

drop policy if exists "Members insert own maintenance tasks" on public.maintenance_tasks;
create policy "Members insert own maintenance tasks"
on public.maintenance_tasks for insert to authenticated
with check (exists (select 1 from public.business_members bm where bm.business_id=maintenance_tasks.business_id and bm.user_id=(select auth.uid())));

drop policy if exists "Members update own maintenance tasks" on public.maintenance_tasks;
create policy "Members update own maintenance tasks"
on public.maintenance_tasks for update to authenticated
using (exists (select 1 from public.business_members bm where bm.business_id=maintenance_tasks.business_id and bm.user_id=(select auth.uid())))
with check (exists (select 1 from public.business_members bm where bm.business_id=maintenance_tasks.business_id and bm.user_id=(select auth.uid())));

drop policy if exists "Members delete own maintenance tasks" on public.maintenance_tasks;
create policy "Members delete own maintenance tasks"
on public.maintenance_tasks for delete to authenticated
using (exists (select 1 from public.business_members bm where bm.business_id=maintenance_tasks.business_id and bm.user_id=(select auth.uid())));
