// Human-readable inquiry reference: AHV-YYMMDD-XXXXXX
//
// This value is the `inquiries` PRIMARY KEY and the public tracking identifier,
// and the client mints it (the R2 object keys for the cargo photos are derived
// from it, so it has to exist before the upload).
//
// It used to be `Math.random().toString(36).slice(2, 6)` — at most 4 base-36
// characters, and sometimes fewer, since toString(36) of a small float can yield
// a short string. That is ~1.6M combinations per day at best, and a collision
// surfaced as a raw Postgres duplicate-key 502 *after* the user's photos had
// already been uploaded. Now 6 characters from a CSPRNG: ~1.07 billion per day.

// Crockford-style alphabet: no I, L, O or U, so a reference read out over the
// phone or copied from a screenshot cannot be mistyped into a different
// valid-looking one.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SUFFIX_LENGTH = 6;

export const REFERENCE_PATTERN = /^AHV-\d{6}-[0-9A-HJKMNP-TV-Z]{6}$/;

function randomSuffix() {
  const bytes = new Uint8Array(SUFFIX_LENGTH);

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Non-browser fallback (SSR / tests). Never the hot path.
    for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  let suffix = '';
  for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
    // 256 % 32 === 0, so this modulo introduces no bias.
    suffix += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return suffix;
}

export function createInquiryReference() {
  const stamp = new Date().toISOString().slice(2, 10).replaceAll('-', '');

  return `AHV-${stamp}-${randomSuffix()}`;
}
