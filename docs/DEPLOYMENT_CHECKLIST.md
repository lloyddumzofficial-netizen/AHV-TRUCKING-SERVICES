# AHV Deployment Checklist

Run this before every production publish.

## Local Verification

- Run `npm run verify`.
- Confirm `.env.local` is not tracked by git.
- Confirm no real secrets are committed; production secrets must live only in the hosting provider environment settings.

## Required Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_EMAILS`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_R2_BUCKET`
- `CLOUDFLARE_R2_PUBLIC_URL`
- Optional: `GOOGLE_MAPS_API_KEY`
- Optional: `NEXT_PUBLIC_AHV_PHONE`
- Optional: `NEXT_PUBLIC_AHV_PHONE_LABEL`

## Supabase

- Apply `supabase/schema.sql` or the equivalent migration chain.
- Apply all files in `supabase/migrations/`.
- Confirm Supabase Auth redirect URLs include the production domain and `/auth/callback`.
- Confirm the admin users listed in `ADMIN_EMAILS` have completed profiles.

## Live Smoke Test

- Customer can sign up or sign in.
- Customer can complete profile with photo.
- Customer can submit inquiry with cargo images.
- Admin can open `/admin`, update status, quote price, and assign/admin-note the inquiry.
- Admin can generate driver tracking link.
- Driver tracking link can start and stop GPS sharing.
- Customer can open My Requests and see the map immediately.
- Image URLs load from the public R2 URL.

## Production Notes

- Publish to staging first, test one full real inquiry, then promote to production.
- Rotate Supabase/R2 keys if they were ever shared outside the local machine or hosting provider secret store.
