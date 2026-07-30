export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../../../lib/supabase/admin.js';
import { getUserFromRequest } from '../../../../lib/supabase/auth.js';
import { checkInquiryQuota } from '../../../../lib/inquiries/quota.js';

/**
 * Preflight for the inquiry wizard: can this user submit right now?
 *
 * Called before the cargo photos are uploaded to R2. Previously the cooldown and
 * active-inquiry cap were only checked in POST /api/inquiries, which runs after
 * the upload — so a 429 orphaned every uploaded object in the bucket.
 */
export async function GET(request) {
  const { user, error } = await getUserFromRequest(request);

  if (error) {
    return NextResponse.json({ error }, { status: 401 });
  }

  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json({ error: 'Supabase database is not configured.' }, { status: 503 });
  }

  try {
    const quota = await checkInquiryQuota(getSupabaseAdminClient(), user.id);

    return NextResponse.json({
      allowed: quota.allowed,
      reason: quota.reason,
      retryAfterMinutes: quota.retryAfterMinutes,
      activeCount: quota.activeCount,
    });
  } catch (quotaError) {
    return NextResponse.json({ error: quotaError.message }, { status: 502 });
  }
}
