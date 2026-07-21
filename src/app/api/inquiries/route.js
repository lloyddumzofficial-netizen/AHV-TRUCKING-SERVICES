import { NextResponse } from 'next/server';
import { hydrateInquiryRow, hydrateInquiryRows } from '../../../lib/inquiries/serverQueries.js';
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../../lib/supabase/admin.js';
import { getUserFromRequest } from '../../../lib/supabase/auth.js';

function missingBackendResponse() {
  return NextResponse.json(
    { error: 'Supabase database is not configured. Add SUPABASE_SERVICE_ROLE_KEY before using live inquiries.' },
    { status: 503 },
  );
}

function requiredString(value, field) {
  if (!value || typeof value !== 'string') {
    throw new Error(`${field} is required.`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${field} is required.`);
  }

  return trimmed;
}

function requiredPoint(value, field) {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(`${field} marker is required.`);
  }

  return {
    lat,
    lng,
  };
}

async function getCompletedProfile(supabase, userId) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .neq('full_name', '')
    .neq('phone', '')
    .neq('location', '')
    .not('profile_image_url', 'is', null)
    .neq('profile_image_url', '')
    .not('completed_at', 'is', null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function GET(request) {
  const { user, error } = await getUserFromRequest(request);

  if (error) {
    return NextResponse.json({ error }, { status: 401 });
  }

  if (!hasSupabaseAdminConfig()) {
    return missingBackendResponse();
  }

  const supabase = getSupabaseAdminClient();
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get('reference')?.trim() || '';
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 20, 1), 50);
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 502 });
  }

  const role = profile?.role || 'user';
  const query = supabase
    .from('inquiries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(role === 'admin' ? Math.max(limit, 20) : limit);

  if (role !== 'admin') {
    query.eq('user_id', user.id);
  }

  if (reference) {
    query.eq('reference', reference);
  }

  const { data, error: inquiryError } = await query;

  if (inquiryError) {
    return NextResponse.json({ error: inquiryError.message }, { status: 502 });
  }

  let inquiries;

  try {
    inquiries = await hydrateInquiryRows(supabase, data || []);
  } catch (hydrateError) {
    return NextResponse.json({ error: hydrateError.message }, { status: 502 });
  }

  return NextResponse.json({
    inquiries,
    role,
  });
}

export async function POST(request) {
  const { user, error } = await getUserFromRequest(request);

  if (error) {
    return NextResponse.json({ error }, { status: 401 });
  }

  let body;
  let reference;
  let pickupAddress;
  let deliveryAddress;
  let cargoType;

  try {
    body = await request.json();
    reference = requiredString(body.reference, 'Reference');
    pickupAddress = requiredString(body.pickupAddress, 'Pickup address');
    deliveryAddress = requiredString(body.deliveryAddress, 'Delivery address');
    cargoType = requiredString(body.cargoType, 'Cargo type');
  } catch (validationError) {
    return NextResponse.json({ error: validationError.message }, { status: 400 });
  }

  if (!hasSupabaseAdminConfig()) {
    return missingBackendResponse();
  }

  const supabase = getSupabaseAdminClient();

  try {
    const completedProfile = await getCompletedProfile(supabase, user.id);

    if (!completedProfile) {
      return NextResponse.json({ error: 'Complete your profile before creating an inquiry.' }, { status: 403 });
    }

    const pickup = body.pickup || {};
    const delivery = body.delivery || {};
    const inquiry = {
      reference,
      user_id: user.id,
      customer_name: requiredString(body.name, 'Name'),
      customer_phone: requiredString(body.phone, 'Phone'),
      pickup_address: pickupAddress,
      delivery_address: deliveryAddress,
      pickup_lat: Number(pickup.lat),
      pickup_lng: Number(pickup.lng),
      delivery_lat: Number(delivery.lat),
      delivery_lng: Number(delivery.lng),
      cargo_type: cargoType,
      weight_kg: body.weight ? Number(body.weight) : null,
      quantity: body.quantity ? Number(body.quantity) : 1,
      notes: body.notes || '',
      route_distance_km: body.routeDistance ? Number(body.routeDistance) : null,
      status: 'new',
    };

    const { error: inquiryError } = await supabase.from('inquiries').insert(inquiry);

    if (inquiryError) {
      throw new Error(inquiryError.message);
    }

    const images = Array.isArray(body.images) ? body.images : [];
    const imageRows = images.map((image) => ({
      id: crypto.randomUUID(),
      inquiry_reference: reference,
      object_key: image.key || '',
      public_url: image.publicUrl || '',
      filename: image.name || 'cargo-image',
    }));

    if (imageRows.length > 0) {
      const { error: imageError } = await supabase.from('inquiry_images').insert(imageRows);

      if (imageError) {
        throw new Error(imageError.message);
      }
    }

    await supabase.from('inquiry_status_history').insert({
      id: crypto.randomUUID(),
      inquiry_reference: reference,
      status: 'new',
      notes: 'Inquiry submitted by client.',
      changed_by: user.id,
    });

    return NextResponse.json({ inquiry: { ...body, userId: user.id } }, { status: 201 });
  } catch (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 502 });
  }
}

export async function PATCH(request) {
  const { user, error } = await getUserFromRequest(request);

  if (error) {
    return NextResponse.json({ error }, { status: 401 });
  }

  if (!hasSupabaseAdminConfig()) {
    return missingBackendResponse();
  }

  let body;
  let reference;
  let pickupAddress;
  let deliveryAddress;
  let pickup;
  let delivery;

  try {
    body = await request.json();
    reference = requiredString(body.reference, 'Reference');
    pickupAddress = requiredString(body.pickupAddress, 'Pickup address');
    deliveryAddress = requiredString(body.deliveryAddress, 'Delivery address');
    pickup = requiredPoint(body.pickup, 'Pickup');
    delivery = requiredPoint(body.delivery, 'Delivery');
  } catch (validationError) {
    return NextResponse.json({ error: validationError.message }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from('inquiries')
    .select('reference, status, user_id')
    .eq('reference', reference)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 502 });
  }

  if (!existing) {
    return NextResponse.json({ error: 'Inquiry not found for this customer account.' }, { status: 404 });
  }

  if (!['new', 'reviewing'].includes(existing.status)) {
    return NextResponse.json(
      { error: 'Location can only be corrected while the inquiry is New or Reviewing. Please contact AHV admin for scheduled shipments.' },
      { status: 409 },
    );
  }

  const updates = {
    pickup_address: pickupAddress,
    delivery_address: deliveryAddress,
    pickup_lat: pickup.lat,
    pickup_lng: pickup.lng,
    delivery_lat: delivery.lat,
    delivery_lng: delivery.lng,
    route_distance_km: body.routeDistance ? Number(body.routeDistance) : null,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };

  const { data, error: updateError } = await supabase
    .from('inquiries')
    .update(updates)
    .eq('reference', reference)
    .eq('user_id', user.id)
    .select('*')
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 502 });
  }

  await supabase.from('inquiry_status_history').insert({
    id: crypto.randomUUID(),
    inquiry_reference: reference,
    status: existing.status,
    notes: 'Client corrected pickup and delivery location details.',
    changed_by: user.id,
  });

  let inquiry;

  try {
    inquiry = await hydrateInquiryRow(supabase, data);
  } catch (hydrateError) {
    return NextResponse.json({ error: hydrateError.message }, { status: 502 });
  }

  return NextResponse.json({
    inquiry,
  });
}
