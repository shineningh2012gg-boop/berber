# NOIR BARBER production setup

The repository now includes the first authenticated admin dashboard and the database schema for business details, services, appointments, gallery images and customer reviews.

## 1. Create the Supabase project

Create a Supabase project and copy its Project URL and anon/public key into the local environment file:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Never put the Supabase service-role key in a `NEXT_PUBLIC_*` variable or in browser code.

## 2. Create the database

Open Supabase SQL Editor and run `supabase/schema.sql`.

## 3. Create the first administrator

In Supabase Authentication, create the owner account with the intended administrator email and a strong password. Disable public sign-ups after creating the account.

Copy the user's UUID from Authentication > Users. Then run this SQL, replacing the sample values:

```sql
insert into public.businesses (name, slug, is_published)
values ('NOIR BARBER', 'noir-barber', false)
returning id;
```

Copy the returned business UUID, then run:

```sql
insert into public.business_members (business_id, user_id, role)
values ('BUSINESS_UUID_HERE', 'AUTH_USER_UUID_HERE', 'owner');
```

The slug must remain `noir-barber` for this first NOIR deployment. For a new client site, use a unique slug and configure the app's business slug before deployment.

## 4. Sign in

Start the app and open `/admin`. Sign in with the administrator account created in Supabase Authentication.

The first admin version supports:
- Business name, phone, address, Instagram, Google Maps link and about text
- Add, hide, publish and delete services
- Add and moderate manually supplied customer reviews with a 1–5 rating
- Add and remove gallery images by image URL
- View appointment rows and change their status

Only authenticated users listed in `business_members` can manage business content. Public users can read published content.

## 5. Enable public appointment requests

After `schema.sql` has been run, open Supabase SQL Editor and run `supabase/booking.sql`. This creates two restricted RPC functions: one returns available time slots, and the other creates a pending appointment after validating the business, active service, opening hours and overlaps. Booking attempts for this business are serialized by locking its business row. The website calls these functions through `/api/appointments`; no service-role key is required.

The schedule currently allows Monday–Saturday, 09:00–19:00, with the time options shown on the booking form. Sunday is closed. Pending and confirmed appointments both reserve their time. The admin can confirm or cancel pending requests.

Do not create an anonymous INSERT policy on `appointments`. Test a request, confirm it appears in `/admin`, then test that the same time is no longer offered. Add proper edge/WAF rate limiting before a high-traffic public launch; the booking endpoint currently uses input validation and a hidden honeypot but does not provide distributed rate limiting.

The public homepage now reads published business details, active services and published reviews from Supabase. Gallery images still need to be connected to the homepage and the admin currently accepts image URLs rather than uploads.

## 6. Remove the old email feature

If the earlier email-notification SQL was already run on this project, open Supabase SQL Editor and run `supabase/remove_email_features.sql`, then run `supabase/booking.sql` again. This removes the customer email column and private email-settings table and restores the booking function without email.

New installations should not run any email-related SQL files.

## 7. Google reviews

Manual reviews are stored separately and must be genuine reviews with permission to publish. Google-sourced reviews require a compliant Google Places API integration and should be labelled as Google-sourced. Do not copy a Google review into the manual source or imply a manually entered review came from Google.
