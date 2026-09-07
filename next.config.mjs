// Next.js configuration for CODEVERSE.
//
// The application is data-driven and intentionally quiet: it owns one dynamic page
// plus two server-side API routes, with no client-side routing, redirects, or
// rewrites. All runtime configuration happens via environment variables (see
// .env.example); this file declares only the small set of framework options that
// matter for production.

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Apply consistent security headers to every response. The same set is also
  // declared in vercel.json so deployments that bypass Next.js (e.g. the Vercel
  // edge layer) emit identical headers.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
        ],
      },
    ];
  },
};

export default nextConfig;