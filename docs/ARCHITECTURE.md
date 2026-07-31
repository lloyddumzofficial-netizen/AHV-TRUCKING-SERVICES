# AHV Web App Architecture

## Main Areas

- `src/app`: Next.js app routes and API routes.
- `src/components`: React UI components.
- `src/lib`: shared business logic, API clients, auth helpers, GPS helpers, validation, and integrations.
- `src/data`: static app labels/options.
- `supabase`: database schema and migrations.

## Critical Flows

- Customer auth: `src/components/AuthPanel.jsx`, `src/app/auth/callback/route.js`, `src/lib/supabase/client.js`.
- Profile onboarding: `src/components/profile/ProfileOnboarding.jsx`, `src/lib/profile/api.js`, `src/app/api/profile/route.js`.
- Inquiry submission: `src/components/InquiryForm.jsx`, `src/lib/inquiries/api.js`, `src/app/api/inquiries/route.js`.
- Image uploads: `src/app/api/uploads/route.js`, `src/app/api/uploads/presign/route.js`, `src/lib/cloudflare/r2.js`.
- Live GPS: `src/app/driver/track/[token]/page.jsx`, `src/app/api/driver/track/[token]/route.js`, `src/components/RouteDisplayMap.jsx`.
- Admin dashboard: `src/components/admin/AdminDashboard.jsx`, `src/app/api/admin/inquiries`.

## Shared Helpers

- Client API response handling: `src/lib/http/apiClient.js`.
- Supabase user token verification: `src/lib/supabase/auth.js`.
- Supabase service-role client: `src/lib/supabase/admin.js`.
- Stored/rendered label sanitization: `src/lib/security/sanitize.js`.
- Public-route rate limiting: `src/lib/security/rateLimit.js`.

## Maintenance Rules

- Put new browser API calls through `apiFetch` unless a streaming/body-special case needs custom handling.
- Never trust driver tracking input; sanitize before storing or rendering.
- External free APIs must fail gracefully with JSON, not uncaught server errors.
- Keep customer mobile changes in the final responsive layer of `src/App.css` unless a component-specific rule is safer.
