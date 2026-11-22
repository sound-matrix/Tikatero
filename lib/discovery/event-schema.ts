import type { PublicEvent } from "./data";
import { tierState } from "./model";

/**
 * Google Event structured data for one publicly bookable, physical event.
 * Keep offers consistent with the live booking states shown on the event page.
 */
export function buildEventJsonLd(
  e: PublicEvent,
  origin: string,
  now: number,
  posterUrl: string | null,
) {
  const url = `${origin}/e/${e.slug}`;
  const eventEnd = e.ends_at ?? e.starts_at;
  const overallSoldOut = e.capacity !== null && e.tickets_sold >= e.capacity;
  const offers = e.tiers.map((t) => {
    const state = tierState(t, eventEnd, now);
    const availability =
      overallSoldOut || state === "Sold out"
        ? "https://schema.org/SoldOut"
        : state === "Available"
          ? "https://schema.org/InStock"
          : undefined; // Not yet selling, closed sales, and ended events are not preorders.
    return {
      "@type": "Offer",
      name: t.name,
      price: (e.is_free ? 0 : t.price_paise) / 100,
      priceCurrency: "INR",
      // Google must be able to crawl the public page without signing in.
      // Attendees can then choose their ticket and follow the booking links.
      url,
      ...(availability ? { availability } : {}),
      ...(t.sales_start ? { validFrom: t.sales_start } : {}),
    };
  });
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    description: e.description || `${e.title} in ${e.city ?? e.country}.`,
    startDate: e.starts_at,
    ...(e.ends_at ? { endDate: e.ends_at } : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url,
    image: [posterUrl ?? `${url}/opengraph-image`],
    isAccessibleForFree: e.is_free,
    location: {
      "@type": "Place",
      ...(e.venue_name ? { name: e.venue_name } : {}),
      address: {
        "@type": "PostalAddress",
        ...(e.address ? { streetAddress: e.address } : {}),
        ...(e.city ? { addressLocality: e.city } : {}),
        addressCountry: e.country,
      },
      ...(e.lat !== null && e.lng !== null
        ? { geo: { "@type": "GeoCoordinates", latitude: e.lat, longitude: e.lng } }
        : {}),
    },
    ...(e.organiser_name
      ? { organizer: { "@type": "Organization", name: e.organiser_name } }
      : {}),
    ...(offers.length ? { offers } : {}),
  };
}
