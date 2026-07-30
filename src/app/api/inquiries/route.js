export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { hydrateInquiryRow, hydrateInquiryRows } from '../../../lib/inquiries/serverQueries.js';
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../../lib/supabase/admin.js';
import { getUserFromRequest } from '../../../lib/supabase/auth.js';
import { supportsGpsHardeningColumns } from '../../../lib/supabase/schemaCapabilities.js';
import { checkInquiryQuota } from '../../../lib/inquiries/quota.js';
import { REFERENCE_PATTERN } from '../../../lib/inquiries/reference.js';

// Every inquiries column except driver_tracking_token / driver_token_expires_at.
// Kept as an explicit allowlist rather than a `select('*')` minus a filter so a
// future column has to be opted in deliberately.
const CUSTOMER_INQUIRY_COLUMNS = [
  'reference',
  'user_id',
  'customer_name',
  'customer_phone',
  'pickup_address',
  'delivery_address',
  'pickup_lat',
  'pickup_lng',
  'delivery_lat',
  'delivery_lng',
  'cargo_type',
  'weight_kg',
  'quantity',
  'notes',
  'route_distance_km',
  'status',
  'created_at',
  'updated_at',
  'assigned_admin_id',
  'assigned_admin_email',
  'admin_notes',
  'quoted_price',
  'target_pickup_date',
  'target_delivery_date',
  'updated_by',
  'driver_location',
  'driver_lat',
  'driver_lng',
  'driver_accuracy_m',
  'driver_speed_kph',
  'driver_heading',
  'driver_updated_at',
  'driver_tracking_active',
];

const CUSTOMER_INQUIRY_SELECT = CUSTOMER_INQUIRY_COLUMNS.join(', ');
// driver_fix_at only exists after 20260730_driver_gps_hardening.sql.
const CUSTOMER_INQUIRY_SELECT_HARDENED = [...CUSTOMER_INQUIRY_COLUMNS, 'driver_fix_at'].join(', ');

function missingBackendResponse() {
  return NextResponse.json(
    { error: 'Supabase database is not configured. Add SUPABASE_SERVICE_ROLE_KEY before using live inquiries.' },
    { status: 503 },
  );
}

function requiredString(value, field, minLength = 1, pattern = null) {
  if (!value || typeof value !== 'string') {
    throw new Error(`${field} is required.`);
  }

  const trimmed = value.trim();

  if (trimmed.length < minLength) {
    throw new Error(`${field} must be at least ${minLength} characters long.`);
  }

  if (pattern && !new RegExp(pattern).test(trimmed)) {
    throw new Error(`${field} format is invalid.`);
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

function optionalPositiveNumber(value, field) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${field} must be a positive number.`);
  }

  return number;
}

function optionalRouteDistance(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error('Route distance is invalid.');
  }

  return number;
}

function requiredQuantity(value) {
  const quantity = value === '' || value === null || value === undefined ? 1 : Number(value);

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
    throw new Error('Quantity must be a whole number from 1 to 10000.');
  }

  return quantity;
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
  // Customers must never receive driver_tracking_token: with it they could POST
  // to the unauthenticated driver endpoint and fabricate their own shipment's
  // GPS trail. Admins get the full row because the console needs the token to
  // render and copy the driver link.
  const customerSelect = (await supportsGpsHardeningColumns(supabase))
    ? CUSTOMER_INQUIRY_SELECT_HARDENED
    : CUSTOMER_INQUIRY_SELECT;

  const query = supabase
    .from('inquiries')
    .select(role === 'admin' ? '*' : customerSelect)
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
  let pickupPoint;
  let deliveryPoint;
  let uploadedImages;
  let routeDistance;
  let weightKg;
  let quantity;

  try {
    body = await request.json();
    // The client mints the primary key (the R2 object keys for the cargo photos
    // derive from it), so pin it to the expected shape rather than accepting any
    // arbitrary string as a table PK.
    reference = requiredString(body.reference, 'Reference');
    if (!REFERENCE_PATTERN.test(reference)) {
      throw new Error('Reference format is invalid.');
    }
    pickupAddress = requiredString(body.pickupAddress, 'Pickup address');
    deliveryAddress = requiredString(body.deliveryAddress, 'Delivery address');
    cargoType = requiredString(body.cargoType, 'Cargo type');
    pickupPoint = requiredPoint(body.pickup, 'Pickup');
    deliveryPoint = requiredPoint(body.delivery, 'Delivery');
    routeDistance = optionalRouteDistance(body.routeDistance);
    weightKg = optionalPositiveNumber(body.weight, 'Weight');
    quantity = requiredQuantity(body.quantity);
    uploadedImages = Array.isArray(body.images) ? body.images : [];

    if (uploadedImages.length === 0) {
      throw new Error('At least one cargo image is required.');
    }

    const invalidImage = uploadedImages.find((image) => !image?.key || !image?.publicUrl);

    if (invalidImage) {
      throw new Error('Every cargo image must finish uploading before submission.');
    }

    if (routeDistance !== null && routeDistance < 1) {
      throw new Error('Pickup and delivery locations are too close. Minimum route distance is 1 km.');
    }
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

    const inquiry = {
      reference,
      user_id: user.id,
      customer_name: requiredString(body.name, 'Name', 4, '.*[a-zA-Z].*'),
      customer_phone: requiredString(body.phone, 'Phone', 11, '^(09|\\+639)\\d{9}$'),
      pickup_address: pickupAddress,
      delivery_address: deliveryAddress,
      pickup_lat: pickupPoint.lat,
      pickup_lng: pickupPoint.lng,
      delivery_lat: deliveryPoint.lat,
      delivery_lng: deliveryPoint.lng,
      cargo_type: cargoType,
      weight_kg: weightKg,
      quantity,
      notes: body.notes || '',
      route_distance_km: routeDistance,
      status: 'new',
    };

    // Cooldown + active-inquiry cap. The wizard also checks this via
    // GET /api/inquiries/quota *before* uploading photos, so a rejection here
    // should be rare (a race, or a direct API caller).
    const quota = await checkInquiryQuota(supabase, user.id);

    if (!quota.allowed) {
      return NextResponse.json({ error: quota.reason }, { status: quota.status });
    }

    const { error: inquiryError } = await supabase.from('inquiries').insert(inquiry);

    if (inquiryError) {
      throw new Error(inquiryError.message);
    }

    const imageRows = uploadedImages.map((image) => ({
      id: crypto.randomUUID(),
      inquiry_reference: reference,
      object_key: image.key || '',
      public_url: image.publicUrl || '',
      filename: image.name || 'cargo-image',
    }));

    if (imageRows.length > 0) {
      const { error: imageError } = await supabase.from('inquiry_images').insert(imageRows);

      if (imageError) {
        // Compensating delete: without this the inquiry row survived with no
        // images, counted toward the user's 3-active cap, and blocked their
        // retry — while they were shown a generic failure.
        const { error: rollbackError } = await supabase
          .from('inquiries')
          .delete()
          .eq('reference', reference);

        if (rollbackError) {
          console.error(
            '[inquiries] image insert failed AND rollback failed for',
            reference,
            rollbackError.message,
          );
        }

        throw new Error(imageError.message);
      }
    }

    // The status change already committed; a lost history row only leaves a gap
    // in the customer timeline, so log it rather than failing the submission.
    const { error: historyError } = await supabase.from('inquiry_status_history').insert({
      id: crypto.randomUUID(),
      inquiry_reference: reference,
      status: 'new',
      notes: 'Inquiry submitted by client.',
      changed_by: user.id,
    });

    if (historyError) {
      console.error('[inquiries] initial status history insert failed for', reference, historyError.message);
    }

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
  let routeDistance;

  try {
    body = await request.json();
    reference = requiredString(body.reference, 'Reference');
    pickupAddress = requiredString(body.pickupAddress, 'Pickup address');
    deliveryAddress = requiredString(body.deliveryAddress, 'Delivery address');
    pickup = requiredPoint(body.pickup, 'Pickup');
    delivery = requiredPoint(body.delivery, 'Delivery');
    routeDistance = optionalRouteDistance(body.routeDistance);

    if (routeDistance !== null && routeDistance < 1) {
      throw new Error('Pickup and delivery locations are too close. Minimum route distance is 1 km.');
    }
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
    route_distance_km: routeDistance,
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
