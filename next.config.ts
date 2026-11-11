import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security/headers";
import { parsePublicBaseUrl } from "./lib/uploads/public-base";

const publicMediaBase = process.env.R2_PUBLIC_BASE_URL
  ? parsePublicBaseUrl(process.env.R2_PUBLIC_BASE_URL)
  : null;

const nextConfig: NextConfig = {
  cacheComponents: true,
  serverExternalPackages: ["@react-pdf/renderer"],
  // Resolve event visibility in metadata before sending headers: missing/draft/paused
  // event URLs must return HTTP 404, including to ordinary browsers.
  htmlLimitedBots: /.*/,
  images: {
    remotePatterns: publicMediaBase
      ? [
          {
            protocol: "https",
            hostname: publicMediaBase.hostname,
            port: publicMediaBase.port,
            pathname: `${publicMediaBase.pathname}**`,
            search: "",
          },
        ]
      : [],
    maximumRedirects: 0,
  },
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          mediaHost: publicMediaBase?.host,
        }),
      },
    ];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
