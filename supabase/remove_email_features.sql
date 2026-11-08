-- Remove the old email-notification database changes.
-- Run this once in Supabase SQL Editor, then run supabase/booking.sql again.
drop function if exists public.create_public_appointment(text, text, text, uuid, timestamptz);
alter table public.appointments drop column if exists customer_email;
drop table if exists public.business_notification_settings cascade;
