// Fixed-window IP rate limiting for unauthenticated proxy routes.
//
// /api/places/search, /api/places/photo and /api/places/photo/media forward to
// Google Places with our billed key attached; /api/routes/directions and the
// Nominatim fallback hit free public services with usage policies. None of these
// can require auth: every caller (PhilippinesMapPicker, RouteDisplayMap,
// AdminRouteTools) fetches them without an Authorization header, and
// getUserFromRequest is bearer-only. Throttling by IP protects the quota without
// breaking any caller.
//
// Best effort by design: serverless instances each keep their own counters, which
// is enough to stop one client looping. Move to Upstash/Redis if you need a hard
// global cap.

const buckets = new Map();
const MAX_TRACKED_KEYS = 5000;

/** Best-effort client IP from the usual proxy headers. */
export function getClientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return (
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    'unknown'
  );
}

/**
 * @returns {{ allowed: boolean, remaining: number, retryAfterSeconds: number }}
 */
export function checkRateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    if (buckets.size >= MAX_TRACKED_KEYS) {
      for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  bucket.count += 1;

  if (bucket.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  return { allowed: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

/**
 * Guard a request by client IP. Returns null when allowed, or a 429 Response.
 *
 * @param {Request} request
 * @param {string} scope   Distinct name per route so budgets don't share a bucket.
 */
export function enforceIpRateLimit(request, scope, { limit, windowMs }) {
  const { allowed, retryAfterSeconds } = checkRateLimit(
    `${scope}:${getClientIp(request)}`,
    { limit, windowMs },
  );

  if (allowed) return null;

  return new Response(
    JSON.stringify({ error: 'Too many requests. Please slow down.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSeconds),
        'Cache-Control': 'no-store',
      },
    },
  );
}

/** Test-only. */
export function resetRateLimits() {
  buckets.clear();
}
