# NOIR BARBER — starter project

Premium bilingual (Turkish/English) barbershop website UI with a multi-tenant Supabase schema starter.

## What is included
- Responsive white/black premium landing page
- Turkish / English toggle
- Service cards with example prices and durations
- Booking form UI
- Google Business Profile link placeholder
- Admin-panel preview modal
- Supabase schema starter for businesses, members, services and appointments

## Important status
This is a **starter/demo**, not a live production booking system yet. The form only saves real bookings after Supabase is configured, and the current sample `business_id` is a placeholder. The admin panel is a visual preview, not authenticated yet. Google reviews are not yet fetched from Places API. Do not publish it as a production booking service until the server-side booking endpoint, secure admin authentication, RLS policies, collision prevention, opening-hours rules, and tenant provisioning are completed and tested.

## Run locally
1. Install Node.js 20 or newer.
2. In this folder run `npm install`.
3. Copy `.env.example` to `.env.local` and add your Supabase project URL and anon key.
4. Run `npm run dev` and open `http://localhost:3000`.

Without Supabase environment variables, the site still runs as a visual demo and the booking form explains that live storage is not connected.

## Supabase setup
1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL Editor.
3. Create the first business and add its owner to `business_members`.
4. Build a server-side booking endpoint before accepting public appointments. Never expose the service-role key in browser code.

## Before production
- Implement authenticated owner/staff dashboard.
- Add server-side booking validation and atomic overlap prevention.
- Add business-specific opening hours, breaks, holidays and service management.
- Add secure tenant creation and owner assignment.
- Add Google Places API integration with an API key restricted by domain/API and correct attribution.
- Add privacy notice, consent and retention rules for customer phone numbers.
- Add backups, monitoring, error logging and deployment configuration.
