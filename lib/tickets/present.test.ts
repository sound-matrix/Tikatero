import { expect, it } from "vitest";
import { calendarIcs, mapsLink, seatLabel, ticketFacts, TICKET_TERMS } from "./present";

const source = {
  code: "TK-01Z01-01",
  seq: 1,
  total: 2,
  holderName: "Asha",
  buyerName: "Buyer",
  tierName: "VIP Lounge",
  vip: true,
  pricePaise: 79900,
  eventTitle: "Diwali, Dhamaka",
  startsAt: "2026-11-07T12:30:00.000Z",
  endsAt: null,
  gatesOpenAt: "2026-11-07T12:00:00.000Z",
  venueName: "NSCI Dome",
  address: "Worli",
  city: "Mumbai",
  mapsUrl: "javascript:alert(1)",
  lat: 19.0176,
  lng: 72.8162,
  isTest: true,
};

it("builds an India-time ticket and ignores an unsafe maps link", () => {
  const facts = ticketFacts(source);
  expect(facts.whenLabel).toContain("IST");
  expect(facts.gatesLabel).toContain("IST");
  expect(facts.priceLabel).toContain("incl. GST");
  expect(
    ticketFacts({
      ...source,
      address: "Worli, Mumbai 400018",
      city: "Mumbai",
      lat: null,
      lng: null,
    }).addressLabel,
  ).toBe("Worli, Mumbai 400018");
  expect(facts.mapsUrl).toBe("https://www.google.com/maps/search/?api=1&query=19.0176,72.8162");
  expect(seatLabel(1, 2)).toBe("Ticket 1 of 2");
  expect(
    mapsLink({ ...source, mapsUrl: "https://maps.google.com/?q=Worli", lat: null, lng: null }),
  ).toContain("maps.google.com");
});

it("writes a calendar file in UTC with escaped text", () => {
  const ics = calendarIcs(ticketFacts(source));
  expect(ics).toContain("DTSTART:20261107T123000Z");
  expect(ics).toContain("DTEND:20261107T143000Z");
  expect(ics).toContain("SUMMARY:Diwali\\, Dhamaka");
  expect(ics.replace(/\r\n /g, "")).toContain(TICKET_TERMS);
  expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
});
