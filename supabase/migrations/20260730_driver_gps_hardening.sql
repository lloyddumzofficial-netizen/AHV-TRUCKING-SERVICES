-- Driver GPS hardening
--
-- 1. driver_fix_at: when the GPS fix was actually taken on the device, kept
--    separate from driver_updated_at (which the server now stamps from its own
--    clock). Previously the client's timestamp was trusted for driver_updated_at,
--    so a phone with a skewed clock broke viewer freshness, and the 15s heartbeat
--    re-stamped stale coordinates with a fresh time — making a stalled GPS look
--    permanently live. Freshness is now derived from driver_fix_at.
--
-- 2. driver_token_expires_at: the tracking token was a permanent UUID even though
--    the API error text already claimed "or token expired". A link forwarded out
--    of a Messenger thread stayed valid forever.

alter table public.inquiries
  add column if not exists driver_fix_at timestamptz;

alter table public.inquiries
  add column if not exists driver_token_expires_at timestamptz;

-- Backfill so existing rows do not read as "never had a fix".
update public.inquiries
   set driver_fix_at = driver_updated_at
 where driver_fix_at is null
   and driver_updated_at is not null;

-- Give already-issued tokens a bounded life rather than revoking them outright.
update public.inquiries
   set driver_token_expires_at = now() + interval '7 days'
 where driver_tracking_token is not null
   and driver_token_expires_at is null;

-- Ordering guard lookups (reject out-of-order position writes) and expiry checks.
create index if not exists idx_inquiries_driver_fix_at
  on public.inquiries(driver_fix_at);

comment on column public.inquiries.driver_fix_at is
  'Device clock time the GPS fix was taken. Source of truth for live/stale display.';
comment on column public.inquiries.driver_updated_at is
  'Server clock time the position write landed. Not client-controlled.';
comment on column public.inquiries.driver_token_expires_at is
  'Hard expiry for driver_tracking_token. Nulled together with the token.';
