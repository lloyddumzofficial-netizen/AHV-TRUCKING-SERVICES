/**
 * No next.config existed before, so the app shipped with no security headers.
 *
 * The CSP is deliberately permissive about the third parties this app already
 * depends on (Supabase realtime over wss, CARTO basemap tiles, OSM/Nominatim,
 * Cloudflare R2 images, Google Fonts). Tighten `connect-src`/`img-src` if any of
 * those change rather than widening them.
 */
const CSP = [
  "default-src 'self'",
  // Next.js injects inline bootstrap scripts and uses eval in dev.
  process.env.NODE_ENV === 'development'
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https: wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // The driver page needs geolocation; nothing needs camera or microphone
  // (photo upload uses a file input with capture, not getUserMedia).
  { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // Live GPS state must never be served from a cache.
        source: '/api/driver/track/:token',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
    ];
  },
};

export default nextConfig;
