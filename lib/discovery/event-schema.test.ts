import { describe, expect, it } from "vitest";
import type { PublicEvent } from "./data";
import { buildEventJsonLd } from "./event-schema";

const now = Date.parse("2026-11-22T06:00:00Z");
const ticket = {
  id: "general", name: "General", price_paise: 149999,
  qty_total: 100, qty_sold: 10, sales_start: null, sales_end: null, is_vip: false,
};
function event(overrides: Partial<PublicEvent> = {}): PublicEvent {
  return {
    slug: "music-night", title: "Music Night", description: "Live music",
    starts_at: "2026-12-12T13:30:00Z", ends_at: "2026-12-12T16:30:00Z",
    is_free: false, venue_name: "City Arena", address: "Main Road",
    city: "Hyderabad", country: "IN", lat: 17.4, lng: 78.4,
    organiser_name: "Example Organiser", poster_key: null,
    tickets_sold: 10, capacity: 100, tiers: [ticket], guests: [],
    ...overrides,
  } as PublicEvent;
}
const schema = (e: PublicEvent) =>
  buildEventJsonLd(e, "https://tikatero.com", now, null);

describe("Google Event structured data", () => {
  it("uses a crawlable event landing URL, venue, timezone-safe dates, price and stock", () => {
    const data = schema(event());
    expect(data).toMatchObject({
      "@type": "Event", name: "Music Night",
      startDate: "2026-12-12T13:30:00Z",
      location: { "@type": "Place", name: "City Arena", address: { addressCountry: "IN" } },
      url: "https://tikatero.com/e/music-night",
      offers: [{ price: 1499.99, priceCurrency: "INR",
        availability: "https://schema.org/InStock",
        url: "https://tikatero.com/e/music-night" }],
    });
  });
  it("marks sold out tiers and event-wide full capacity as sold out", () => {
    expect(schema(event({ tiers: [{ ...ticket, qty_sold: 100 }] })).offers?.[0].availability)
      .toBe("https://schema.org/SoldOut");
    expect(schema(event({ capacity: 10 })).offers?.[0].availability)
      .toBe("https://schema.org/SoldOut");
  });
  it("does not mislabel closed sales and future tickets as preorders", () => {
    const future = schema(event({ tiers: [{ ...ticket, sales_start: "2026-12-01T00:00:00Z" }] }));
    expect(future.offers?.[0]).not.toHaveProperty("availability");
    expect(future.offers?.[0]).toHaveProperty("validFrom", "2026-12-01T00:00:00Z");
    const closed = schema(event({ tiers: [{ ...ticket, sales_end: "2026-11-01T00:00:00Z" }] }));
    expect(closed.offers?.[0]).not.toHaveProperty("availability");
  });
  it("uses zero-price offers for free tickets without changing ticket count", () => {
    expect(schema(event({ is_free: true })).offers?.[0]).toMatchObject({
      price: 0, priceCurrency: "INR",
    });
  });
  it("does not invent a venue or ticket offer when information is absent", () => {
    const data = schema(event({ venue_name: null, tiers: [] }));
    expect(data.location).not.toHaveProperty("name");
    expect(data).not.toHaveProperty("offers");
  });
});
