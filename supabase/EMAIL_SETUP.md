# NOIR BARBER email notifications

## 1. Database migration
Run `supabase/email_notifications.sql` and then `supabase/business_notification_settings.sql` once each in the Supabase SQL Editor.

## 2. Resend setup
Create a Resend account and verify a sender domain you control. Then add these environment variables to StackBlitz and the production host:

```env
RESEND_API_KEY=re_...
NOTIFICATION_FROM_EMAIL="NOIR BARBER <randevu@your-verified-domain.com>"
SUPABASE_SERVICE_ROLE_KEY=your_server_only_service_role_key
```

Never put the service-role key in a `NEXT_PUBLIC_*` variable, commit it to GitHub, or paste it into chat. The service-role key is used only by the server to read the private notification address.

## 3. Set the business notification address
Sign in to `/admin`, open **E-posta Ayarları**, enter the business owner's notification email, and save it. The address is stored in a private table accessible only to signed-in business members and the server.

## 4. What sends email
- New appointment requests send an email to the saved business notification address.
- When the manager confirms or cancels an appointment in the admin panel, the customer receives an email at the address entered in the booking form.
- If Resend or the server-only service-role environment variable is not configured, booking still works but the business notification email cannot be sent.
- Restart the dev server after changing environment variables.
- Configure the same server-only variables in the production host before publishing.
