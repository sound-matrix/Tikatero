import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const origin = "https://tikatero.com";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/console/",
          "/account/",
          "/api/",
          "/auth/",
          "/checkout/",
          "/_next/",
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
