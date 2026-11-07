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

## 5. Before accepting real bookings

The public booking form is not production-ready yet. It must be moved behind a server-side endpoint that validates the business, service, opening hours, availability and request rate, and prevents overlapping appointments transactionally. Do not create an anonymous INSERT policy for appointments.

The public homepage still needs to be connected to the editable database content, and the gallery needs a managed image-upload flow. Do not advertise those features as live until that integration is completed and tested.

## 6. Google reviews

Manual reviews are stored separately and must be genuine reviews with permission to publish. Google-sourced reviews require a compliant Google Places API integration and should be labelled as Google-sourced. Do not copy a Google review into the manual source or imply a manually entered review came from Google.
