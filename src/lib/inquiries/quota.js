// Submission limits, shared by the preflight check and the create handler.
//
// These limits used to be enforced only inside POST /api/inquiries — which runs
// *after* the client has already uploaded its cargo photos to R2. Hitting the
// cooldown or the active-inquiry cap therefore returned 429 and left every
// uploaded object orphaned in the bucket forever. The wizard now calls
// GET /api/inquiries/quota before uploading, and the handler still re-checks
// (the preflight is advisory - never the only gate).

export const COOLDOWN_MINUTES = 5;
export const MAX_ACTIVE_INQUIRIES = 3;
export const ACTIVE_STATUSES = ['new', 'processing'];

/**
 * @returns {Promise<{ allowed: boolean, reason: string|null, status: number,
 *   retryAfterMinutes: number|null, activeCount: number }>}
 */
export async function checkInquiryQuota(supabase, userId) {
  const { data: recentInquiries, error } = await supabase
    .from('inquiries')
    .select('created_at, status')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = recentInquiries || [];
  const activeCount = rows.filter((row) => ACTIVE_STATUSES.includes(row.status)).length;

  if (rows.length > 0) {
    const lastAt = new Date(rows[0].created_at).getTime();
    const diffMinutes = (Date.now() - lastAt) / 60000;

    if (Number.isFinite(diffMinutes) && diffMinutes < COOLDOWN_MINUTES) {
      const wait = Math.max(1, Math.ceil(COOLDOWN_MINUTES - diffMinutes));
      return {
        allowed: false,
        reason: `Please wait about ${wait} more minute${wait === 1 ? '' : 's'} before submitting another inquiry.`,
        status: 429,
        retryAfterMinutes: wait,
        activeCount,
      };
    }

    if (activeCount >= MAX_ACTIVE_INQUIRIES) {
      return {
        allowed: false,
        reason: `You have reached the maximum of ${MAX_ACTIVE_INQUIRIES} active inquiries. Please wait for admin approval on your existing requests.`,
        status: 429,
        retryAfterMinutes: null,
        activeCount,
      };
    }
  }

  return { allowed: true, reason: null, status: 200, retryAfterMinutes: null, activeCount };
}
