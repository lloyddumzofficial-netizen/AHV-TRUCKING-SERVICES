# AHV Trucking Services

Mobile-first Next.js inquiry webapp for AHV Trucking Services.

## Scripts

- `npm run dev` starts the Next.js dev server.
- `npm run build` creates a production Next.js build.
- `npm run start` runs the production build.
- `npm run lint` checks the source with Oxlint.

## Notes

The Philippine map uses Leaflet/OpenStreetMap and is loaded client-side for Next.js compatibility.

## Code Organization

- `src/app` contains Next.js routes and API endpoints.
- `src/components` contains UI components only.
- `src/data` contains editable business content and option lists.
- `src/lib/supabase` contains Supabase auth and database helpers.
- `src/lib/cloudflare` contains Cloudflare R2 file upload helpers.
- `src/lib/inquiries` contains inquiry-specific client API calls and utilities.

## Backend Setup

1. Copy `.env.example` to `.env.local`.
2. Create a Supabase project and add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_EMAILS` as a comma-separated list for the AHV admins
3. Run `supabase/schema.sql` in the Supabase SQL Editor.
4. Create a Cloudflare R2 bucket for profile and cargo images and add:
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_R2_ACCESS_KEY_ID`
   - `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
   - `CLOUDFLARE_R2_BUCKET`
   - `CLOUDFLARE_R2_PUBLIC_URL`

Supabase handles auth and database records. Cloudflare R2 stores profile and cargo images. Authenticated inquiries are saved through `/api/inquiries`, admin operations are protected through `/api/admin/inquiries`, and images upload through `/api/uploads`.

## Google OAuth

Enable Google in Supabase Authentication Providers, then configure Google OAuth to allow this redirect URL for local development:

```text
http://localhost:3000/auth/callback
```

For production, add the production callback URL:

```text
https://your-domain.com/auth/callback
```
