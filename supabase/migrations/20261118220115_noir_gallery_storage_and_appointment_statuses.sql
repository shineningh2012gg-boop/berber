alter table public.gallery_images
  add column if not exists storage_path text;

alter table public.appointments
  drop constraint if exists appointments_status_check;

alter table public.appointments
  add constraint appointments_status_check
  check (status = any (array['pending','confirmed','rejected','cancelled','completed']::text[]));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-gallery', 'business-gallery', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view business gallery files" on storage.objects;
create policy "Public can view business gallery files"
on storage.objects for select to public
using (bucket_id = 'business-gallery');

drop policy if exists "Business members upload own gallery files" on storage.objects;
create policy "Business members upload own gallery files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'business-gallery'
  and (storage.foldername(name))[1] in (
    select bm.business_id::text from public.business_members bm
    where bm.user_id = (select auth.uid())
  )
);

drop policy if exists "Business members update own gallery files" on storage.objects;
create policy "Business members update own gallery files"
on storage.objects for update to authenticated
using (
  bucket_id = 'business-gallery'
  and (storage.foldername(name))[1] in (
    select bm.business_id::text from public.business_members bm
    where bm.user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'business-gallery'
  and (storage.foldername(name))[1] in (
    select bm.business_id::text from public.business_members bm
    where bm.user_id = (select auth.uid())
  )
);

drop policy if exists "Business members delete own gallery files" on storage.objects;
create policy "Business members delete own gallery files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'business-gallery'
  and (storage.foldername(name))[1] in (
    select bm.business_id::text from public.business_members bm
    where bm.user_id = (select auth.uid())
  )
);
