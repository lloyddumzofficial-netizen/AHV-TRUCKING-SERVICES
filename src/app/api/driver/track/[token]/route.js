export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../../../../lib/supabase/admin.js';

export async function GET(request, { params }) {
  try {
    const { token } = await params;

    if (!hasSupabaseAdminConfig()) {
      return NextResponse.json({ error: 'System not configured' }, { status: 503 });
    }

    const supabase = getSupabaseAdminClient();

    const { data: existing, error: findError } = await supabase
      .from('inquiries')
      .select('reference, status, pickup_address, delivery_address, driver_lat, driver_lng, driver_accuracy_m, driver_speed_kph, driver_heading, driver_updated_at, driver_tracking_active')
      .eq('driver_tracking_token', token)
      .maybeSingle();

    if (findError) {
      return NextResponse.json({ error: 'Database error' }, { status: 502 });
    }

    if (!existing) {
      return NextResponse.json({ error: 'Invalid tracking token or token expired.' }, { status: 401 });
    }

    return NextResponse.json({ inquiry: existing });
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
    const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng);
    const active = body.active !== false;

    if (!hasCoordinates && body.active !== false) {
      return NextResponse.json({ error: 'Missing coordinates' }, { status: 400 });
    }

    if (!hasSupabaseAdminConfig()) {
      return NextResponse.json({ error: 'System not configured' }, { status: 503 });
    }

    const supabase = getSupabaseAdminClient();

    // Use service role to bypass RLS since the driver isn't authenticated as a user
    const { data: existing, error: findError } = await supabase
      .from('inquiries')
      .select('reference, status')
      .eq('driver_tracking_token', token)
      .maybeSingle();

    if (findError) {
      return NextResponse.json({ error: 'Database error' }, { status: 502 });
    }

    if (!existing) {
      return NextResponse.json({ error: 'Invalid tracking token or token expired.' }, { status: 401 });
    }

    const accuracy = Number(body.accuracy);
    const speed = Number(body.speed);
    const heading = Number(body.heading);
    const clientTimestamp = body.timestamp ? new Date(body.timestamp) : null;
    const driverUpdatedAt = clientTimestamp && !Number.isNaN(clientTimestamp.getTime())
      ? clientTimestamp.toISOString()
      : new Date().toISOString();

    const updates = {
      driver_tracking_active: active,
      driver_updated_at: driverUpdatedAt,
      updated_at: new Date().toISOString(),
    };

    if (hasCoordinates) {
      updates.driver_lat = lat;
      updates.driver_lng = lng;
      updates.driver_location = body.locationLabel || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    }

    if (Number.isFinite(accuracy)) {
      updates.driver_accuracy_m = accuracy;
    }

    if (Number.isFinite(speed)) {
      updates.driver_speed_kph = Math.max(0, speed);
    }

    if (Number.isFinite(heading)) {
      updates.driver_heading = heading;
    }

    const { error: updateError } = await supabase
      .from('inquiries')
      .update(updates)
      .eq('reference', existing.reference);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update location' }, { status: 502 });
    }

    return NextResponse.json({ success: true, reference: existing.reference, active, driverUpdatedAt });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
