import type { NextConfig } from "next";
import { parsePublicBaseUrl } from "./lib/uploads/public-base";

const publicMediaBase = process.env.R2_PUBLIC_BASE_URL
  ? parsePublicBaseUrl(process.env.R2_PUBLIC_BASE_URL)
  : null;

const nextConfig: NextConfig = {
  cacheComponents: true,
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
