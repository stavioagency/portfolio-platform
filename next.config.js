/** @type {import('next').NextConfig} */
const securityHeaders = [
  // Prevent clickjacking. SAMEORIGIN allows the AppearanceEditor iframe preview (admin loading /) to work.
  { key: 'X-Frame-Options',        value: 'SAMEORIGIN' },
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
