import type { MetadataRoute } from "next";
import { sitemapEventSlugs, publicCityEvents } from "@/lib/discovery/data";
import { eventCities, cityPath } from "@/lib/discovery/cities";
import { siteOrigin } from "@/lib/discovery/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [origin, slugs, citiesWithEvents] = await Promise.all([
    siteOrigin(),
    sitemapEventSlugs(),
    Promise.all(eventCities.map(async (city) => ({ city, hasEvents: (await publicCityEvents(city.name)).length > 0 }))),
  ]);
  return [
    { url: `${origin}/` },
    { url: `${origin}/events` },
    { url: `${origin}/events/upcoming` },
    { url: `${origin}/pricing` },
    { url: `${origin}/help` },
    { url: `${origin}/contact` },
    ...citiesWithEvents.filter((item) => item.hasEvents).map(({ city }) => ({ url: `${origin}${cityPath(city)}` })),
    ...slugs.map((slug) => ({ url: `${origin}/e/${slug}` })),
  ];
}
