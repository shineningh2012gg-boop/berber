# NOIR BARBER email notifications

## 1. Supabase database migration

Run `supabase/email_notifications.sql` once in the Supabase SQL Editor. It adds the customer email column, updates the public booking RPC, and restricts booking dates to the next 10 days.

## 2. Resend setup

Create a Resend account and verify a sender domain you control. Then add these environment variables to StackBlitz and to the production hosting environment:

```env
RESEND_API_KEY=re_...
NOTIFICATION_FROM_EMAIL=NOIR BARBER <randevu@your-verified-domain.com>
ADMIN_NOTIFICATION_EMAIL=the-business-owner@example.com
```

Use a sender address on the domain verified in Resend. Do not commit these values to GitHub or paste the API key into chat.

## 3. What sends email

- A new appointment request sends an email to `ADMIN_NOTIFICATION_EMAIL`.
- When a manager confirms or cancels an appointment in the admin panel, the customer receives an email at the address entered in the booking form.
- If the Resend variables are not configured, bookings and status changes still work, but email delivery will not happen.

Restart the development server after changing environment variables. Configure the same variables in the production host before publishing.
