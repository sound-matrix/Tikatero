import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security/headers";
import { storagePublicBase } from "./lib/uploads/public-base";

const mediaBase = storagePublicBase(process.env.NEXT_PUBLIC_SUPABASE_URL);
const publicMediaBase = mediaBase ? new URL(mediaBase) : null;

const nextConfig: NextConfig = {
  cacheComponents: true,
  serverExternalPackages: ["@react-pdf/renderer"],
  // Resolve event visibility in metadata before sending headers: missing/draft/paused
  // event URLs must return HTTP 404, including to ordinary browsers.
  htmlLimitedBots: /.*/,
  images: {
    dangerouslyAllowLocalIP:
      process.env.VERCEL_ENV !== "production" &&
      ["127.0.0.1", "localhost"].includes(publicMediaBase?.hostname ?? ""),
    remotePatterns: publicMediaBase
      ? [
          {
            protocol: publicMediaBase.protocol === "https:" ? "https" : "http",
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
