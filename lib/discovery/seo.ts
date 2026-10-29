import "server-only";
import { headers } from "next/headers";
import type { PublicEvent } from "./data";
import { tierState } from "./model";
import { mediaUrl } from "@/components/discovery/media";
export async function siteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    try {
      const u = new URL(configured);
      if (["http:", "https:"].includes(u.protocol)) return u.origin;
    } catch {}
  }
  const h = await headers(),
    host = h.get("host") ?? "localhost:3000";
  const protocol = h.get("x-forwarded-proto") === "https" ? "https" : "http";
  return new URL(`${protocol}://${host}`).origin;
}
export function eventJsonLd(e: PublicEvent, origin: string, now: number) {
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    description: e.description ?? undefined,
    startDate: e.starts_at,
    endDate: e.ends_at ?? undefined,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url: `${origin}/e/${e.slug}`,
    image: [mediaUrl(e.poster_key) ?? `${origin}/e/${e.slug}/opengraph-image`],
    isAccessibleForFree: e.is_free,
    location: {
      "@type": "Place",
      name: e.venue_name,
      address: {
        "@type": "PostalAddress",
        streetAddress: e.address,
        addressLocality: e.city,
        addressCountry: e.country,
      },
      ...(e.lat !== null && e.lng !== null
        ? { geo: { "@type": "GeoCoordinates", latitude: e.lat, longitude: e.lng } }
        : {}),
    },
    organizer: { "@type": "Organization", name: e.organiser_name },
    offers: e.tiers.map((t) => ({
      "@type": "Offer",
      name: t.name,
      price: ((e.is_free ? 0 : t.price_paise) / 100).toFixed(2),
      priceCurrency: "INR",
      url: `${origin}/e/${e.slug}/book`,
      availability:
        tierState(t, e.ends_at ?? e.starts_at, now) === "Sold out"
          ? "https://schema.org/SoldOut"
          : tierState(t, e.ends_at ?? e.starts_at, now) === "Available"
            ? "https://schema.org/InStock"
            : "https://schema.org/PreOrder",
      validFrom: t.sales_start ?? undefined,
      availabilityEnds: t.sales_end ?? undefined,
    })),
  };
}
