import { formatIst } from "@/lib/format";
import { formatINR } from "@/lib/email/format";

export const TICKET_TERMS = "Entry with valid QR only. Each QR scans once.";
export const BRIGHTNESS_HINT =
  "Turn your screen brightness up. After you open this page once, it also works offline.";

export type TicketSource = {
  code: string;
  seq: number | null;
  total: number;
  holderName: string | null;
  buyerName: string;
  tierName: string;
  vip: boolean;
  pricePaise: number;
  eventTitle: string;
  startsAt: string;
  endsAt: string | null;
  gatesOpenAt: string | null;
  venueName: string | null;
  address: string | null;
  city: string | null;
  mapsUrl: string | null;
  lat: number | string | null;
  lng: number | string | null;
  isTest: boolean;
};

export type TicketFacts = {
  code: string;
  seq: number | null;
  total: number;
  holderName: string;
  tierName: string;
  vip: boolean;
  priceLabel: string;
  eventTitle: string;
  startsAt: string;
  endsAt: string | null;
  whenLabel: string;
  gatesLabel: string;
  venueName: string;
  addressLabel: string;
  mapsUrl: string | null;
  isTest: boolean;
};

export function seatLabel(seq: number | null, total: number) {
  if (!seq || total < 1) return "Your ticket";
  return `Ticket ${seq} of ${total}`;
}

function coordinate(value: number | string | null) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function allowedMapsHost(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === "google.com" ||
    host === "www.google.com" ||
    host === "maps.google.com" ||
    host === "maps.app.goo.gl" ||
    host.endsWith(".google.com") ||
    host.endsWith(".google.co.in")
  );
}

export function mapsLink(
  source: Pick<TicketSource, "mapsUrl" | "lat" | "lng" | "venueName" | "address" | "city">,
) {
  if (source.mapsUrl) {
    try {
      const url = new URL(source.mapsUrl);
      if (url.protocol === "https:" && allowedMapsHost(url.hostname)) return url.toString();
    } catch {
      // Fall through to a search link we build ourselves.
    }
  }
  const lat = coordinate(source.lat);
  const lng = coordinate(source.lng);
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  const query = [source.venueName, source.address, source.city].filter(Boolean).join(", ");
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function placeLine(address: string | null, city: string | null) {
  const street = address?.trim() ?? "";
  const town = city?.trim() ?? "";
  if (street && town && street.toLowerCase().includes(town.toLowerCase())) return street;
  return [street, town].filter(Boolean).join(", ");
}

export function ticketFacts(source: TicketSource): TicketFacts {
  const addressLabel = placeLine(source.address, source.city);
  return {
    code: source.code,
    seq: source.seq,
    total: source.total,
    holderName: source.holderName?.trim() || source.buyerName,
    tierName: source.tierName,
    vip: source.vip,
    priceLabel: formatINR(source.pricePaise),
    eventTitle: source.eventTitle,
    startsAt: source.startsAt,
    endsAt: source.endsAt,
    whenLabel: formatIst(source.startsAt),
    gatesLabel: source.gatesOpenAt
      ? `Gates open ${formatIst(source.gatesOpenAt)}`
      : "Gates open at the start time",
    venueName: source.venueName?.trim() || "Venue to be confirmed",
    addressLabel,
    mapsUrl: mapsLink(source),
    isTest: source.isTest,
  };
}

function icsStamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid ticket time.");
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function icsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function fold(line: string) {
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 73) {
    parts.push(rest.slice(0, 73));
    rest = ` ${rest.slice(73)}`;
  }
  parts.push(rest);
  return parts.join("\r\n");
}

export function calendarIcs(facts: TicketFacts) {
  const end = facts.endsAt
    ? icsStamp(facts.endsAt)
    : icsStamp(new Date(Date.parse(facts.startsAt) + 2 * 60 * 60 * 1000).toISOString());
  const location = [facts.venueName, facts.addressLabel].filter(Boolean).join(", ");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sound Matrix//Tikatero//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${facts.code}@tikatero`,
    `DTSTAMP:${icsStamp(new Date().toISOString())}`,
    `DTSTART:${icsStamp(facts.startsAt)}`,
    `DTEND:${end}`,
    `SUMMARY:${icsText(facts.eventTitle)}`,
    `LOCATION:${icsText(location)}`,
    `DESCRIPTION:${icsText(`${seatLabel(facts.seq, facts.total)} ${facts.code}. ${TICKET_TERMS}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
