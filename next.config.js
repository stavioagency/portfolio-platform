/** @type {import('next').NextConfig} */
const securityHeaders = [
  // Prevent clickjacking. 'self' allows the AppearanceEditor iframe preview
  // (admin loading /) to work, exactly as SAMEORIGIN did; designakum.com is
  // allowed so the marketing site can embed a live preview of a portfolio.
  // Using CSP rather than X-Frame-Options because XFO cannot allow a specific
  // third-party origin (its ALLOW-FROM directive is obsolete and unsupported).
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self' https://designakum.com" },
  // Prevent MIME-type sniffing.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Don't leak full referrer URLs to third parties.
  { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
  // Lock down access to powerful browser APIs we don't use.
  { key: 'Permissions-Policy',     value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  // Force HTTPS (Vercel serves HTTPS anyway, this just tells the browser to remember).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.supabase.in' },
    ],
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

module.exports = nextConfig;
