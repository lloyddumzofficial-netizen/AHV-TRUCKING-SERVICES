export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getAdminContext } from '../../../../../../lib/admin/auth.js';
import { supportsGpsHardeningColumns } from '../../../../../../lib/supabase/schemaCapabilities.js';
import { logAdminAction } from '../../../../../../lib/admin/audit.js';

// How long a freshly minted driver link stays usable.
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(request, { params }) {
  const context = await getAdminContext(request);

  if (context.error) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { reference } = await params;
  const supabase = context.supabase;
  const hardened = await supportsGpsHardeningColumns(supabase);

  // Check if inquiry exists
  const { data: existing, error: existingError } = await supabase
    .from('inquiries')
    .select(hardened ? 'reference, driver_tracking_token, driver_token_expires_at' : 'reference, driver_tracking_token')
    .eq('reference', reference)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 502 });
  }

  if (!existing) {
    return NextResponse.json({ error: 'Inquiry not found.' }, { status: 404 });
  }

  // Generate a new UUID token with a bounded life. The link gets pasted into
  // SMS/Messenger threads, so an indefinitely valid token is a standing risk.
  const newToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  const { data, error } = await supabase
    .from('inquiries')
    .update(
      hardened
        ? { driver_tracking_token: newToken, driver_token_expires_at: expiresAt }
        : { driver_tracking_token: newToken },
    )
    .eq('reference', reference)
    .select(hardened ? 'driver_tracking_token, driver_token_expires_at' : 'driver_tracking_token')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  await logAdminAction(supabase, {
    adminUser: context.user,
    inquiryReference: reference,
    action: 'driver_link.generate',
    before: {
      driver_tracking_token: existing.driver_tracking_token ? 'existing' : null,
      driver_token_expires_at: existing.driver_token_expires_at || null,
    },
    after: {
      driver_tracking_token: 'generated',
      driver_token_expires_at: data.driver_token_expires_at ?? null,
    },
    notes: 'Generated secure driver GPS tracking link.',
  });

  return NextResponse.json({
    token: data.driver_tracking_token,
    expiresAt: data.driver_token_expires_at ?? null,
  });
}

export async function DELETE(request, { params }) {
  const context = await getAdminContext(request);

  if (context.error) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { reference } = await params;
  const supabase = context.supabase;

  const hardened = await supportsGpsHardeningColumns(supabase);
  const { data: existing, error: existingError } = await supabase
    .from('inquiries')
    .select(hardened ? 'reference, driver_tracking_token, driver_tracking_active, driver_token_expires_at' : 'reference, driver_tracking_token, driver_tracking_active')
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
    .update({
      driver_tracking_token: null,
      driver_tracking_active: false,
      ...(hardened ? { driver_token_expires_at: null } : {}),
    })
    .eq('reference', reference);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  await logAdminAction(supabase, {
    adminUser: context.user,
    inquiryReference: reference,
    action: 'driver_link.revoke',
    before: existing || { reference },
    after: { driver_tracking_token: null, driver_tracking_active: false },
    notes: 'Revoked driver GPS tracking link.',
  });

  return NextResponse.json({ success: true });
}
