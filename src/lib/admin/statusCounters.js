import { INQUIRY_STATUSES } from '../../data/inquiryStatus.js';

// The admin status badges need one count per status: 11 extra round trips on
// every GET /api/admin/inquiries — and the dashboard polls every 30s on top of
// four realtime table subscriptions. Badge numbers a few seconds stale are
// harmless, so cache them briefly and invalidate on writes.
//
// Lives in lib/ rather than in the route file because Next.js App Router route
// modules should only export HTTP method handlers and route config.

const COUNTER_CACHE_MS = 15000;
const COUNTER_KEYS = ['all', ...INQUIRY_STATUSES];

let cache = { at: 0, value: null };

async function countByStatus(supabase, status) {
  let query = supabase.from('inquiries').select('reference', { count: 'exact', head: true });

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return count || 0;
}

export async function getStatusCounters(supabase) {
  if (cache.value && Date.now() - cache.at < COUNTER_CACHE_MS) {
    return cache.value;
  }

  const counts = await Promise.all(COUNTER_KEYS.map((key) => countByStatus(supabase, key)));
  const value = COUNTER_KEYS.reduce((acc, key, index) => ({ ...acc, [key]: counts[index] }), {});

  cache = { at: Date.now(), value };
  return value;
}

/** Call after any write that changes statuses, so an admin sees their own action. */
export function invalidateStatusCounters() {
  cache = { at: 0, value: null };
}

export function emptyStatusCounters(total = 0) {
  return INQUIRY_STATUSES.reduce((acc, status) => ({ ...acc, [status]: 0 }), { all: total });
}
