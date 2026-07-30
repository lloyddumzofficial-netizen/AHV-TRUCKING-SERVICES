export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { INQUIRY_STATUSES } from '../../../../../data/inquiryStatus.js';
import { getAdminContext } from '../../../../../lib/admin/auth.js';
import { hydrateInquiryRow } from '../../../../../lib/inquiries/serverQueries.js';
import { sanitizeLabel } from '../../../../../lib/security/sanitize.js';
import { PH_UTC_OFFSET } from '../../../../../lib/datetime.js';
import { supportsGpsHardeningColumns } from '../../../../../lib/supabase/schemaCapabilities.js';
import { invalidateStatusCounters } from '../../../../../lib/admin/statusCounters.js';
import { logAdminAction } from '../../../../../lib/admin/audit.js';

// Statuses after which a driver tracking link should no longer work.
const TRACKING_FINISHED_STATUSES = ['delivered', 'cancelled'];

function optionalString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value).trim();
}

// <input type="datetime-local"> submits a naive "YYYY-MM-DDTHH:mm" with no zone.
// new Date() would parse that in the *server's* zone (UTC on Vercel), so an
// 08:00 PHT pickup was being rewritten to 00:00 PHT on every save. Operations
// are Philippine-local, so pin naive values to +08:00 explicitly.
const NAIVE_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

function optionalDate(value) {
  const stringValue = optionalString(value);

  if (!stringValue) {
    return null;
  }

  const normalized = NAIVE_DATETIME.test(stringValue)
    ? `${stringValue.length === 16 ? `${stringValue}:00` : stringValue}${PH_UTC_OFFSET}`
    : stringValue;

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid schedule date.');
  }

  return date.toISOString();
}

export async function PATCH(request, { params }) {
  const context = await getAdminContext(request);

  if (context.error) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { reference } = await params;
  const body = await request.json();
  const updates = {
    updated_at: new Date().toISOString(),
    updated_by: context.user.id,
  };

  try {
    if (body.status !== undefined) {
      if (!INQUIRY_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: 'Invalid inquiry status.' }, { status: 400 });
      }

      updates.status = body.status;
    }

    if (body.adminNotes !== undefined) {
      updates.admin_notes = optionalString(body.adminNotes) || '';
    }

    if (body.quotedPrice !== undefined) {
      if (body.quotedPrice === '' || body.quotedPrice === null) {
        updates.quoted_price = null;
      } else {
        const quotedPrice = Number(body.quotedPrice);

        if (!Number.isFinite(quotedPrice) || quotedPrice < 0) {
          return NextResponse.json({ error: 'Quoted price must be zero or higher.' }, { status: 400 });
        }

        updates.quoted_price = quotedPrice;
      }
    }

    if (body.targetPickupDate !== undefined) {
      updates.target_pickup_date = optionalDate(body.targetPickupDate);
    }

    if (body.targetDeliveryDate !== undefined) {
      updates.target_delivery_date = optionalDate(body.targetDeliveryDate);
    }

    if (body.assignedAdminEmail !== undefined) {
      updates.assigned_admin_email = optionalString(body.assignedAdminEmail) || '';
    }

    if (body.driverLat !== undefined && body.driverLng !== undefined) {
      const lat = parseFloat(body.driverLat);
      const lng = parseFloat(body.driverLng);
      if (!isNaN(lat) && !isNaN(lng)) {
        updates.driver_lat = lat;
        updates.driver_lng = lng;
      }
    }

    if (body.driverLocation !== undefined) {
      // Rendered into a Leaflet tooltip (innerHTML) on the customer map.
      updates.driver_location = sanitizeLabel(body.driverLocation);
    }
  } catch (validationError) {
    return NextResponse.json({ error: validationError.message }, { status: 400 });
  }

  const supabase = context.supabase;
  const { data: existing, error: existingError } = await supabase
    .from('inquiries')
    .select('reference, status, assigned_admin_email, admin_notes, quoted_price, target_pickup_date, target_delivery_date, driver_location, driver_lat, driver_lng, driver_tracking_token, driver_tracking_active')
    .eq('reference', reference)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 502 });
  }

  if (!existing) {
    return NextResponse.json({ error: 'Inquiry not found.' }, { status: 404 });
  }

  if (updates.target_pickup_date && updates.target_delivery_date) {
    const pickupDate = new Date(updates.target_pickup_date);
    const deliveryDate = new Date(updates.target_delivery_date);

    if (deliveryDate < pickupDate) {
      return NextResponse.json({ error: 'Delivery schedule cannot be before pickup schedule.' }, { status: 400 });
    }
  }

  const effectiveAdminNotes = updates.admin_notes ?? existing.admin_notes ?? '';

  if (updates.status === 'delivered' && !String(effectiveAdminNotes).trim()) {
    return NextResponse.json({ error: 'Add an internal note before marking an inquiry as delivered.' }, { status: 400 });
  }

  const hasDriverCoordinates =
    (Number.isFinite(Number(updates.driver_lat)) && Number.isFinite(Number(updates.driver_lng))) ||
    (Number.isFinite(Number(existing.driver_lat)) && Number.isFinite(Number(existing.driver_lng)));

  if (updates.status === 'in_transit' && !existing.driver_tracking_token && !hasDriverCoordinates) {
    return NextResponse.json({ error: 'Generate a driver tracking link or set a manual driver location before marking In Transit.' }, { status: 400 });
  }

  // Once the trip is over the driver link must stop working, and the truck must
  // stop showing as live on the customer map.
  if (updates.status && TRACKING_FINISHED_STATUSES.includes(updates.status)) {
    updates.driver_tracking_token = null;
    updates.driver_tracking_active = false;
    if (await supportsGpsHardeningColumns(supabase)) {
      updates.driver_token_expires_at = null;
    }
  }

  const { data, error } = await supabase
    .from('inquiries')
    .update(updates)
    .eq('reference', reference)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  await logAdminAction(supabase, {
    adminUser: context.user,
    inquiryReference: reference,
    action: 'inquiry.update',
    before: existing,
    after: data,
    notes: updates.admin_notes || '',
  });

  if (updates.status && updates.status !== existing.status) {
    // The cached status badge counts are now wrong for this admin's own action.
    invalidateStatusCounters();

    const { error: historyError } = await supabase.from('inquiry_status_history').insert({
      id: crypto.randomUUID(),
      inquiry_reference: reference,
      status: updates.status,
      notes: updates.admin_notes || '',
      changed_by: context.user.id,
    });

    // The status change already committed, so don't fail the request — but a
    // silently dropped history row leaves a gap in the customer timeline.
    if (historyError) {
      console.error('[admin] status history insert failed', reference, historyError.message);
    }
  }

  let inquiry;

  try {
    inquiry = await hydrateInquiryRow(supabase, data);
  } catch (hydrateError) {
    return NextResponse.json({ error: hydrateError.message }, { status: 502 });
  }

  return NextResponse.json({ inquiry });
}

export async function DELETE(request, { params }) {
  const context = await getAdminContext(request);

  if (context.error) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { reference } = await params;
  const supabase = context.supabase;
  const { data: existing, error: existingError } = await supabase
    .from('inquiries')
    .select('reference, customer_name, status, assigned_admin_email, quoted_price')
    .eq('reference', reference)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 502 });
  }

  if (!existing) {
    return NextResponse.json({ error: 'Inquiry not found.' }, { status: 404 });
  }

  await logAdminAction(supabase, {
    adminUser: context.user,
    inquiryReference: reference,
    action: 'inquiry.delete',
    before: existing,
    after: { deleted: true },
    notes: 'Inquiry deleted by admin.',
  });

  const { error } = await supabase
    .from('inquiries')
    .delete()
    .eq('reference', reference);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  invalidateStatusCounters();

  return NextResponse.json({ deleted: true, reference });
}
