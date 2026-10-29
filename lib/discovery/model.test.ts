import { describe, it, expect } from "vitest";
import { formatIst } from "@/lib/format";
import {
  filters,
  istDayStart,
  istDayEnd,
  listingUrl,
  publicPrice,
  tierState,
  refundText,
  jsonLdString,
  type Tier,
} from "./model";
const tier: Tier = {
  id: "test",
  name: "General",
  price_paise: 100099,
  qty_total: 10,
  qty_sold: 0,
  sales_start: null,
  sales_end: null,
  is_vip: false,
};
describe("attendee discovery", () => {
  it("displays paise exactly, including fractional rupees", () => {
    expect(publicPrice(100099)).toBe("₹ 1,000.99 incl. GST");
    expect(publicPrice(1)).toBe("₹ 0.01 incl. GST");
    expect(publicPrice(0)).toBe("₹ 0 incl. GST");
    expect(publicPrice(null, true)).toBe("Free — RSVP");
    expect(publicPrice(null)).toBe("Tickets coming soon");
  });
  it("formats IST across the UTC date boundary", () => {
    expect(formatIst("2026-10-29T20:30:00Z")).toBe("30 Oct 2026, 2:00 AM IST");
  });
  it("uses inclusive IST date ranges with an exclusive next-day end", () => {
    expect(istDayStart("2026-10-30")).toBe("2026-10-29T18:30:00.000Z");
    expect(istDayEnd("2026-10-30")).toBe("2026-10-30T18:30:00.000Z");
  });
  it("validates filters, page bounds and impossible dates", () => {
    expect(
      filters({
        page: "-2",
        from: "2026-02-30",
        category: "unknown",
        price: "no",
        country: "invalid",
      }),
    ).toMatchObject({ page: 1, from: "", category: "", price: "", country: "" });
    expect(filters({ page: ["2", "3"], city: "  Hyderabad " })).toMatchObject({
      page: 2,
      city: "Hyderabad",
    });
  });
  it("normalises reversed dates and preserves all filters in pagination", () => {
    const f = filters({
      from: "2026-12-30",
      to: "2026-12-01",
      q: "Music & dance",
      country: "IN",
      city: "Hyderabad",
      category: "Concert",
      price: "paid",
      page: "2",
    });
    expect(f.from).toBe("2026-12-01");
    expect(listingUrl(f)).toContain("q=Music+%26+dance");
    expect(listingUrl(f)).toContain("page=2");
    expect(listingUrl({})).toBe("/events");
  });
  it("distinguishes sold out, future, closed and ended tickets", () => {
    const now = Date.parse("2026-11-01T00:00Z"),
      end = "2026-12-01T00:00Z";
    expect(tierState(tier, end, now)).toBe("Available");
    expect(tierState({ ...tier, qty_sold: 10 }, end, now)).toBe("Sold out");
    expect(tierState({ ...tier, sales_start: end }, end, now)).toBe("Not on sale yet");
    expect(tierState({ ...tier, sales_end: "2026-10-01T00:00Z" }, end, now)).toBe("Sales closed");
    expect(tierState(tier, "2026-10-01T00:00Z", now)).toBe("Event ended");
  });
  it("escapes executable script endings in JSON-LD", () => {
    expect(jsonLdString({ name: "</script><script>alert(1)</script>" })).not.toContain("<");
  });
  it("renders saved refund policies in plain English", () => {
    expect(refundText("72h")).toContain("72 hours");
    expect(refundText("none")).toBe("No refunds for this event.");
    expect(refundText("custom: Refund until Friday.")).toBe("Refund until Friday.");
  });
});
