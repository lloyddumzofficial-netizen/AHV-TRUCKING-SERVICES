// Shared input hardening for values that are stored and later rendered.
//
// Leaflet's bindTooltip/bindPopup assign string content via innerHTML, so any
// text that reaches a map label is an HTML sink. The driver tracking endpoint is
// authenticated by token possession only (the link gets pasted into SMS and
// Messenger), so treat everything it sends as hostile.

const MAX_LABEL_LENGTH = 120;

// C0 and C1 control characters. Matching them is the whole point here: they are
// invisible in a Leaflet tooltip and can be used to smuggle markup past a filter.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp('[\u0000-\u001F\u007F-\u009F]', 'g');
// Characters that are significant in HTML.
const HTML_CHARS = /[<>&"'`]/g;

/**
 * Strip HTML-significant characters and control characters from a free-text
 * label, then clamp its length. Returns null when nothing usable remains.
 */
export function sanitizeLabel(value, maxLength = MAX_LABEL_LENGTH) {
  if (typeof value !== 'string') return null;

  const cleaned = value
    .replace(CONTROL_CHARS, ' ')
    .replace(HTML_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);

  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Escape text for interpolation into an HTML string (Leaflet divIcon markup).
 * Prefer passing a text node where the API allows it; use this when building
 * markup by hand.
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
