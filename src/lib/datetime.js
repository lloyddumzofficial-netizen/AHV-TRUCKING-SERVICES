// AHV operates in the Philippines. <input type="datetime-local"> has no timezone,
// so both sides of the round trip must agree on one explicitly — otherwise the
// server's zone (UTC on Vercel) silently shifts every saved schedule by 8 hours.
export const PH_UTC_OFFSET = '+08:00';
export const PH_UTC_OFFSET_MINUTES = 8 * 60;

/**
 * Format a timestamptz for <input type="datetime-local"> in Philippine local
 * time. Returns '' for missing/unparseable values so the input stays empty.
 *
 * toISOString().slice(0,16) is wrong here: it renders UTC into an input the
 * browser reads as local time.
 */
export function toPhilippineDateTimeInput(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const shifted = new Date(date.getTime() + PH_UTC_OFFSET_MINUTES * 60 * 1000);
  return shifted.toISOString().slice(0, 16);
}

/**
 * Human-readable Philippine local time, used for display only.
 */
export function formatPhilippineDateTime(value, options = {}) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options,
  });
}
