# Risk Audit Notes

## Fixed In This Pass

- Centralized client fetch response handling in `src/lib/http/apiClient.js`.
- Hardened profile, notifications, inquiries, and admin API clients against:
  - missing access tokens,
  - expired sessions,
  - network failures,
  - non-JSON error responses.
- Wrapped Supabase OAuth callback exchange so network failures redirect cleanly instead of throwing.
- Wrapped R2 presigned upload URL creation and direct upload failures with clean JSON errors.
- Wrapped OSRM directions fetch so route downtime returns a stable API error.
- Hardened place search fallback so both Google Places and OpenStreetMap downtime returns an empty result set instead of a 500.
- Added final mobile responsiveness safety layer to reduce overflow, cramped buttons, modal issues, and map control layout problems.

## Remaining Watch Items

- `src/App.css` is very large and contains many historical override blocks. It works, but future styling will be easier if split by domain later:
  - base/layout,
  - customer inquiry,
  - admin,
  - GPS/map,
  - mobile overrides.
- Free route/map providers have no app-owned SLA. Keep graceful fallback behavior.
- Supabase/R2 costs depend on project usage and plan limits.
- The current map is Leaflet raster plus CSS perspective, not real 3D buildings. Real 3D would require a vector/WebGL map path such as MapLibre.
