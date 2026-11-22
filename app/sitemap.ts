import type { MetadataRoute } from "next";
import { sitemapEventSlugs, publicCityEvents, publicCategoryEvents } from "@/lib/discovery/data";
import { eventCategories, categoryPath } from "@/lib/discovery/categories";
import { eventCities, cityPath } from "@/lib/discovery/cities";
import { siteOrigin } from "@/lib/discovery/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [origin, slugs, citiesWithEvents, categoriesWithEvents] = await Promise.all([
    siteOrigin(),
    sitemapEventSlugs(),
    Promise.all(eventCities.map(async (city) => ({ city, hasEvents: (await publicCityEvents(city.name)).length > 0 }))),
    Promise.all(eventCategories.map(async (category) => ({ category, hasEvents: (await publicCategoryEvents(category.category)).length > 0 }))),
  ]);
  return [
    { url: `${origin}/` },
    { url: `${origin}/events` },
    { url: `${origin}/pricing` },
    { url: `${origin}/help` },
    { url: `${origin}/contact` },
    { url: `${origin}/organisers` },
    { url: `${origin}/organisers/faq` },
    { url: `${origin}/guides/sell-event-tickets-online` },
    ...citiesWithEvents.filter((item) => item.hasEvents).map(({ city }) => ({ url: `${origin}${cityPath(city)}` })),
    ...categoriesWithEvents.filter((item) => item.hasEvents).map(({ category }) => ({ url: `${origin}${categoryPath(category)}` })),
    ...slugs.map((slug) => ({ url: `${origin}/e/${slug}` })),
  ];
}
