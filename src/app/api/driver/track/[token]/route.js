export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../../../../lib/supabase/admin.js';
import { sanitizeLabel } from '../../../../../lib/security/sanitize.js';
import { supportsGpsHardeningColumns } from '../../../../../lib/supabase/schemaCapabilities.js';

// Columns added by 20260730_driver_gps_hardening.sql.
const BASE_TRACK_COLUMNS =
  'reference, status, pickup_address, delivery_address, driver_lat, driver_lng, driver_accuracy_m, driver_speed_kph, driver_heading, driver_updated_at, driver_tracking_active';
const HARDENED_TRACK_COLUMNS = `${BASE_TRACK_COLUMNS}, driver_fix_at, driver_token_expires_at`;

// This endpoint is authenticated by token possession alone — the driver is not a
// Supabase user. The link travels through SMS/Messenger, so every field is
// treated as hostile and writes are rate limited per token.
const MIN_WRITE_INTERVAL_MS = 2000;
const RATE_LIMIT_MAX_TOKENS = 500;

// Per-token last-write timestamps. Best effort: serverless instances each keep
// their own map, which is enough to stop a single client hammering the endpoint.
const lastWriteByToken = new Map();

function isRateLimited(token) {
  const now = Date.now();
  const previous = lastWriteByToken.get(token);

  if (previous && now - previous < MIN_WRITE_INTERVAL_MS) {
    return true;
  }

  // Bound the map so a token-guessing flood cannot grow it without limit.
  if (lastWriteByToken.size >= RATE_LIMIT_MAX_TOKENS) {
    for (const [key, value] of lastWriteByToken) {
      if (now - value > MIN_WRITE_INTERVAL_MS * 10) lastWriteByToken.delete(key);
    }
  }

  lastWriteByToken.set(token, now);
  return false;
}

function isExpired(row) {
  if (!row.driver_token_expires_at) return false;
  const expiresAt = new Date(row.driver_token_expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt < Date.now();
}

// Only accept a timestamp that is plausible. A budget Android with a skewed clock
// must not be able to poison ordering, so clamp to a window around server time.
const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;

function parseFixTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return null;
  const skew = Math.abs(Date.now() - parsed);
  return skew > MAX_CLOCK_SKEW_MS ? null : new Date(parsed).toISOString();
}

export async function GET(request, { params }) {
  try {
    const { token } = await params;

    if (!hasSupabaseAdminConfig()) {
      return NextResponse.json({ error: 'System not configured' }, { status: 503 });
    }

    const supabase = getSupabaseAdminClient();
    const hardened = await supportsGpsHardeningColumns(supabase);

    const { data: existing, error: findError } = await supabase
      .from('inquiries')
      .select(hardened ? HARDENED_TRACK_COLUMNS : BASE_TRACK_COLUMNS)
      .eq('driver_tracking_token', token)
      .maybeSingle();

    if (findError) {
      return NextResponse.json({ error: 'Database error' }, { status: 502 });
    }

    if (!existing) {
      return NextResponse.json({ error: 'Invalid tracking token.' }, { status: 401 });
    }

    if (isExpired(existing)) {
      return NextResponse.json({ error: 'This tracking link has expired. Ask AHV dispatch for a new one.' }, { status: 401 });
    }

    const { driver_token_expires_at: expiresAt = null, ...inquiry } = existing;

    return NextResponse.json({ inquiry, expiresAt });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { token } = await params;
    const body = await request.json();

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const hasCoordinates =
      Number.isFinite(lat) && Number.isFinite(lng) &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    const active = body.active !== false;

    // A "stop tracking" write legitimately carries no coordinates.
    if (!hasCoordinates && active) {
      return NextResponse.json({ error: 'Missing or invalid coordinates' }, { status: 400 });
    }

    if (!hasSupabaseAdminConfig()) {
      return NextResponse.json({ error: 'System not configured' }, { status: 503 });
    }

    // Never rate limit the final "I stopped" write — dropping it leaves a
    // phantom live truck on the customer's map forever.
    if (active && isRateLimited(token)) {
      return NextResponse.json({ error: 'Too many location updates. Slow down.' }, { status: 429 });
    }

    const supabase = getSupabaseAdminClient();
    const hardened = await supportsGpsHardeningColumns(supabase);

    // Service role bypasses RLS since the driver isn't authenticated as a user.
    const { data: existing, error: findError } = await supabase
      .from('inquiries')
      .select(hardened ? 'reference, status, driver_token_expires_at' : 'reference, status')
      .eq('driver_tracking_token', token)
      .maybeSingle();

    if (findError) {
      return NextResponse.json({ error: 'Database error' }, { status: 502 });
    }

    if (!existing) {
      return NextResponse.json({ error: 'Invalid tracking token.' }, { status: 401 });
    }

    if (isExpired(existing)) {
      return NextResponse.json({ error: 'This tracking link has expired.' }, { status: 401 });
    }

    const accuracy = Number(body.accuracy);
    const speed = Number(body.speed);
    const heading = Number(body.heading);

    // driver_updated_at is the *server's* clock: it records when the write
    // landed and is not client controlled. driver_fix_at is when the device
    // actually took the fix, and is what freshness is judged on.
    const serverNow = new Date().toISOString();
    const fixAt = parseFixTimestamp(body.fixTimestamp || body.timestamp);

    const updates = {
      driver_tracking_active: active,
      driver_updated_at: serverNow,
      updated_at: serverNow,
    };

    if (hasCoordinates) {
      updates.driver_lat = lat;
      updates.driver_lng = lng;
      // Free text from an unauthenticated caller, rendered into a Leaflet
      // tooltip (innerHTML) in the admin console. Strip HTML and clamp length.
      updates.driver_location =
        sanitizeLabel(body.locationLabel) || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      if (hardened) {
        updates.driver_fix_at = fixAt || serverNow;
      }
    }

    // Geolocation returns null heading/speed when stationary. Number(null) is 0,
    // which would record a real "heading due north" instead of "unknown".
    updates.driver_accuracy_m = Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null;
    updates.driver_speed_kph = Number.isFinite(speed) ? Math.max(0, speed) : null;
    updates.driver_heading =
      Number.isFinite(heading) && heading >= 0 && heading <= 360 ? heading : null;

    let query = supabase.from('inquiries').update(updates).eq('reference', existing.reference);

    // Ordering guard: several POSTs can be in flight on a lossy mobile link and
    // land out of order. Without this a late older packet rewinds the marker.
    // Skipped for the stop write, which must always apply.
    if (hardened && hasCoordinates && active && updates.driver_fix_at) {
      query = query.or(`driver_fix_at.is.null,driver_fix_at.lte.${updates.driver_fix_at}`);
    }

    const { data: written, error: updateError } = await query.select('reference').maybeSingle();

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update location' }, { status: 502 });
    }

    // No row matched the ordering guard: a newer fix already landed. Not an
    // error — tell the client so it drops this payload instead of retrying.
    if (!written) {
      return NextResponse.json({
        success: true,
        superseded: true,
        reference: existing.reference,
        active,
        driverUpdatedAt: serverNow,
      });
    }

    return NextResponse.json({
      success: true,
      superseded: false,
      reference: existing.reference,
      active,
      driverUpdatedAt: serverNow,
      driverFixAt: updates.driver_fix_at || null,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
