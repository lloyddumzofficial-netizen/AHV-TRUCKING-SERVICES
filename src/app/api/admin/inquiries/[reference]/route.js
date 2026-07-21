import { NextResponse } from 'next/server';
import { INQUIRY_STATUSES } from '../../../../../data/inquiryStatus.js';
import { getAdminContext } from '../../../../../lib/admin/auth.js';
import { hydrateInquiryRow } from '../../../../../lib/inquiries/serverQueries.js';

function optionalString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value).trim();
}

function optionalDate(value) {
  const stringValue = optionalString(value);

  if (!stringValue) {
    return null;
  }

  const date = new Date(stringValue);

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
      updates.quoted_price = body.quotedPrice === '' || body.quotedPrice === null ? null : Number(body.quotedPrice);
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
  } catch (validationError) {
    return NextResponse.json({ error: validationError.message }, { status: 400 });
  }

  const supabase = context.supabase;
  const { data: existing, error: existingError } = await supabase
    .from('inquiries')
    .select('reference, status')
    .eq('reference', reference)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 502 });
  }

  if (!existing) {
    return NextResponse.json({ error: 'Inquiry not found.' }, { status: 404 });
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

  if (updates.status && updates.status !== existing.status) {
    await supabase.from('inquiry_status_history').insert({
      id: crypto.randomUUID(),
      inquiry_reference: reference,
      status: updates.status,
      notes: updates.admin_notes || '',
      changed_by: context.user.id,
    });
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
    .select('reference')
    .eq('reference', reference)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 502 });
  }

  if (!existing) {
    return NextResponse.json({ error: 'Inquiry not found.' }, { status: 404 });
  }

  const { error } = await supabase
    .from('inquiries')
    .delete()
    .eq('reference', reference);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({ deleted: true, reference });
}
