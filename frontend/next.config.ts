import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mythic/shared"],
  poweredByHeader: false,
  // Security headers for production only — dev keeps HMR friction-free.
  async headers() {
    if (process.env.NODE_ENV !== "production") return [];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; img-src 'self' https://cards.scryfall.io data:; " +
              "connect-src 'self' https://api.scryfall.com; " +
              "style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; " +
              "font-src 'self' data:; frame-ancestors 'none'; " +
              "base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
