// Pure helpers for the driver GPS pipeline.
//
// Kept DOM-free and side-effect-free so the gating rules can be reasoned about
// (and tested) without a phone attached.

// watchPosition with enableHighAccuracy fires roughly once a second on Android.
// Every callback used to become an HTTP POST, a row UPDATE, and — because the
// table is `replica identity full` — a full-row realtime broadcast to every
// subscriber. These thresholds cut that to roughly one write per 10 s at rest.
export const TRACKING_OPTIONS = {
  enableHighAccuracy: true,
  // Live tracking must not accept a cached fix. This was 3000.
  maximumAge: 0,
  timeout: 20000,
};

/** Fixes worse than this are treated as low confidence. */
export const MAX_ACCEPTABLE_ACCURACY_M = 100;
/** ...unless nothing better has arrived in this long, in which case take it. */
export const ACCURACY_GRACE_MS = 60000;
/** Minimum movement before a new fix is worth sending. */
export const MIN_DISTANCE_M = 20;
/** Minimum time between sends, even while moving. */
export const MIN_SEND_INTERVAL_MS = 10000;
/** Resend the last known fix this often so the row keeps a live heartbeat. */
export const HEARTBEAT_MS = 30000;
/** Implied speeds above this mean a bad fix, not a fast truck. */
export const MAX_PLAUSIBLE_SPEED_KPH = 200;
/**
 * Implied speed is meaningless across a very short interval: two fixes 50 ms
 * apart 30 m up the road imply thousands of km/h while being perfectly real.
 * Only apply the speed test once at least this much time has passed.
 */
export const PLAUSIBILITY_WINDOW_MS = 3000;
/** Below the speed window, only reject jumps too large to be anything but bogus. */
export const MAX_INSTANT_JUMP_M = 2000;
/** A fix older than this is no longer "live". */
export const STALE_FIX_MS = 90000;
/** Retry backoff bounds for failed sends. */
export const RETRY_BASE_MS = 5000;
export const RETRY_MAX_MS = 60000;
/** How many pending fixes to keep across an outage or a reload. */
export const QUEUE_LIMIT = 50;

const EARTH_RADIUS_M = 6371000;

/** Great-circle distance in metres. */
export function distanceMeters(a, b) {
  if (!a || !b) return Infinity;
  if (!Number.isFinite(a.lat) || !Number.isFinite(a.lng)) return Infinity;
  if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return Infinity;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Normalize a GeolocationPosition into the payload the API expects.
 *
 * `fixTimestamp` is the device time the fix was taken and is never rewritten —
 * not by the heartbeat, not by a retry. The previous code re-stamped stale
 * coordinates with `new Date()` every 15 s, which made a driver whose GPS had
 * died show a permanently green "Live GPS" chip.
 */
export function coordsToPayload(position, active = true) {
  const { latitude, longitude, accuracy, speed, heading } = position.coords;

  return {
    lat: latitude,
    lng: longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    // Geolocation reports null speed/heading when stationary. Keep them null:
    // Number(null) is 0, which would record a real "heading due north".
    speed: Number.isFinite(speed) && speed !== null ? speed * 3.6 : null,
    heading: Number.isFinite(heading) && heading !== null ? heading : null,
    active,
    fixTimestamp: new Date(position.timestamp || Date.now()).toISOString(),
    locationLabel: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
  };
}

/**
 * Decide whether a newly arrived fix should be sent.
 *
 * Returns { send, reason, lowAccuracy }. `reason` is for driver-facing copy and
 * telemetry, not control flow.
 */
export function evaluateFix(candidate, previous, now = Date.now()) {
  if (!candidate || !Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng)) {
    return { send: false, reason: 'invalid', lowAccuracy: false };
  }

  const accuracy = Number(candidate.accuracy);
  const isLowAccuracy = Number.isFinite(accuracy) && accuracy > MAX_ACCEPTABLE_ACCURACY_M;

  // No previous fix: send whatever we have, even if imprecise. Something on the
  // map beats an empty map.
  if (!previous) {
    return { send: true, reason: 'first-fix', lowAccuracy: isLowAccuracy };
  }

  const elapsed = now - (previous.sentAt || 0);
  const moved = distanceMeters(candidate, previous);

  // Reject teleports: a bad fix, not a fast truck.
  if (Number.isFinite(moved)) {
    if (elapsed >= PLAUSIBILITY_WINDOW_MS) {
      const impliedKph = (moved / 1000) / (elapsed / 3600000);
      if (moved > MIN_DISTANCE_M && impliedKph > MAX_PLAUSIBLE_SPEED_KPH) {
        return { send: false, reason: 'implausible-jump', lowAccuracy: isLowAccuracy };
      }
    } else if (moved > MAX_INSTANT_JUMP_M) {
      // Too soon to judge speed, but a 2 km hop between consecutive fixes is a
      // bad fix regardless of how fast the truck is going.
      return { send: false, reason: 'implausible-jump', lowAccuracy: isLowAccuracy };
    }
  }

  // A low-accuracy fix is held back unless we've had nothing better for a while,
  // otherwise a 2 km cell-tower fix becomes the truck's position at zoom 15.
  if (isLowAccuracy && elapsed < ACCURACY_GRACE_MS) {
    // Still let it through if it is clearly better than what we last sent.
    const previousAccuracy = Number(previous.accuracy);
    if (!Number.isFinite(previousAccuracy) || accuracy >= previousAccuracy) {
      return { send: false, reason: 'low-accuracy', lowAccuracy: true };
    }
  }

  if (moved >= MIN_DISTANCE_M) {
    return { send: true, reason: 'moved', lowAccuracy: isLowAccuracy };
  }

  if (elapsed >= MIN_SEND_INTERVAL_MS) {
    return { send: true, reason: 'interval', lowAccuracy: isLowAccuracy };
  }

  return { send: false, reason: 'throttled', lowAccuracy: isLowAccuracy };
}

/** Capped exponential backoff for failed sends. */
export function retryDelay(failureCount) {
  const exponent = Math.max(0, failureCount - 1);
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** exponent);
}

/** Age of a fix in ms, or null when there is no usable timestamp. */
export function fixAge(fixTimestamp, now = Date.now()) {
  if (!fixTimestamp) return null;
  const parsed = new Date(fixTimestamp).getTime();
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, now - parsed);
}

/** Whether a fix is recent enough to present as live. */
export function isFixFresh(fixTimestamp, now = Date.now()) {
  const age = fixAge(fixTimestamp, now);
  return age !== null && age < STALE_FIX_MS;
}

/** Short human age: "4s ago", "3m ago", "2h ago". */
export function formatAge(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return 'no data';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Human-readable message for a GeolocationPositionError, plus whether the error
 * is terminal. PERMISSION_DENIED is terminal: the watch will never fire again,
 * so continuing to publish `active: true` is a lie.
 */
export function describeGeolocationError(err) {
  const code = err?.code;

  if (code === 1) {
    return {
      terminal: true,
      title: 'Naka-block ang location',
      message:
        'Blocked ang GPS permission. Buksan ang browser settings > Location, i-allow ang site, tapos i-reload ang page.',
    };
  }

  if (code === 2) {
    return {
      terminal: false,
      title: 'Walang GPS signal',
      message:
        'Hindi makuha ang lokasyon ngayon. Lumabas sa mas bukas na lugar o i-on ang phone GPS/Location. Auto-retry ito.',
    };
  }

  if (code === 3) {
    return {
      terminal: false,
      title: 'Mahina ang GPS',
      message: 'Matagal kumuha ng fix ang GPS. Patuloy pa ang pagsubok.',
    };
  }

  return {
    terminal: false,
    title: 'GPS error',
    message: err?.message || 'Hindi malaman ang GPS error. Auto-retry ito.',
  };
}

// ---------------------------------------------------------------------------
// Offline queue
//
// Previously a single `lastPayloadRef` held one payload, overwritten by each new
// fix, so everything produced during an outage was discarded — and a reload or an
// OOM tab kill (routine on cheap Android with a map open) lost it entirely.
// ---------------------------------------------------------------------------

export function queueStorageKey(token) {
  return `ahv:gps-queue:${token}`;
}

export function loadQueue(token) {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(queueStorageKey(token));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && Number.isFinite(item.lat) && Number.isFinite(item.lng))
      .slice(-QUEUE_LIMIT);
  } catch {
    return [];
  }
}

export function saveQueue(token, queue) {
  if (typeof window === 'undefined') return;

  try {
    const trimmed = queue.slice(-QUEUE_LIMIT);
    if (trimmed.length === 0) {
      window.localStorage.removeItem(queueStorageKey(token));
    } else {
      window.localStorage.setItem(queueStorageKey(token), JSON.stringify(trimmed));
    }
  } catch {
    // Storage full or blocked (private mode). The in-memory queue still works.
  }
}

export function clearQueue(token) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(queueStorageKey(token));
  } catch {
    // Ignore.
  }
}
