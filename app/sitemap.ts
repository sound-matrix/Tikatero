import type { MetadataRoute } from "next";
import { sitemapEventSlugs } from "@/lib/discovery/data";
import { siteOrigin } from "@/lib/discovery/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [origin, slugs] = await Promise.all([siteOrigin(), sitemapEventSlugs()]);
  return [
    { url: `${origin}/` },
    { url: `${origin}/events` },
    ...slugs.map((slug) => ({ url: `${origin}/e/${slug}` })),
  ];
}
