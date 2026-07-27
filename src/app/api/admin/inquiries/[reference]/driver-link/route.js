export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getAdminContext } from '../../../../../../lib/admin/auth.js';

export async function POST(request, { params }) {
  const context = await getAdminContext(request);

  if (context.error) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { reference } = await params;
  const supabase = context.supabase;

  // Check if inquiry exists
  const { data: existing, error: existingError } = await supabase
    .from('inquiries')
    .select('reference, driver_tracking_token')
    .eq('reference', reference)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 502 });
  }

  if (!existing) {
    return NextResponse.json({ error: 'Inquiry not found.' }, { status: 404 });
  }

  // Generate a new UUID token
  const newToken = crypto.randomUUID();

  const { data, error } = await supabase
    .from('inquiries')
    .update({ driver_tracking_token: newToken })
    .eq('reference', reference)
    .select('driver_tracking_token')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({ token: data.driver_tracking_token });
}

export async function DELETE(request, { params }) {
  const context = await getAdminContext(request);

  if (context.error) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { reference } = await params;
  const supabase = context.supabase;

  const { error } = await supabase
    .from('inquiries')
    .update({ driver_tracking_token: null })
    .eq('reference', reference);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
