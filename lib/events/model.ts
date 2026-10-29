export const steps = [
  "Basics",
  "Date & time",
  "Venue",
  "Poster",
  "VIP & guests",
  "Ticket tiers",
  "Fees & refunds",
  "Review & publish",
] as const;
export const categories = [
  "Concert",
  "Festival party",
  "Conference",
  "Comedy",
  "Workshop",
  "Sports",
  "Wedding / Private",
  "Other",
] as const;
export const themes = {
  none: { name: "Your own event", title: "", description: "", color: "#F25C54", accent: "#FF9F43" },
  diwali: {
    name: "Diwali — diyas & gold",
    title: "Diwali Celebration",
    description: "Celebrate the festival of lights with music, friends and a memorable evening.",
    color: "#E8590C",
    accent: "#C9A227",
  },
  christmas: {
    name: "Christmas — festive & gold",
    title: "Christmas Celebration",
    description: "An evening of festive music, joyful moments and Christmas cheer for everyone.",
    color: "#0E9F9A",
    accent: "#C9A227",
  },
  new_year: {
    name: "New Year — midnight & gold",
    title: "New Year Celebration",
    description: "Welcome a new year with live music, good company and a midnight celebration.",
    color: "#0D1B2A",
    accent: "#C9A227",
  },
} as const;
export type Guest = { id: string; name: string; title: string; photoKey: string; vip: boolean };
export type Tier = {
  id: string;
  name: string;
  price: string;
  quantity: string;
  perOrderMax: string;
  salesStart: string;
  salesEnd: string;
  vip: boolean;
};
export type Values = {
  title: string;
  category: string;
  description: string;
  theme: keyof typeof themes;
  free: boolean;
  startsAt: string;
  endsAt: string;
  gatesAt: string;
  venue: string;
  address: string;
  city: string;
  country: string;
  mapsUrl: string;
  lat: string;
  lng: string;
  posterKey: string;
  guests: Guest[];
  tiers: Tier[];
  feePayer: "organiser" | "buyer";
  refundPolicy: "72h" | "none" | "custom";
  refundText: string;
};
export function emptyValues(): Values {
  return {
    title: "",
    category: "Concert",
    description: "",
    theme: "none",
    free: false,
    startsAt: "",
    endsAt: "",
    gatesAt: "",
    venue: "",
    address: "",
    city: "",
    country: "IN",
    mapsUrl: "",
    lat: "",
    lng: "",
    posterKey: "",
    guests: [],
    tiers: [],
    feePayer: "organiser",
    refundPolicy: "72h",
    refundText: "",
  };
}
export function slugBase(title: string) {
  return (
    title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80)
      .replace(/-$/g, "") || "event"
  );
}
/** Parse decimal text without floating point arithmetic or implicit rounding. */
export function toPaise(input: string): number {
  const value = input.trim();
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(value))
    throw new Error("Enter a price with up to 2 decimal places.");
  const [whole, fraction = ""] = value.split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise)) throw new Error("This price is too large.");
  return paise;
}
export function priceText(paise: number) {
  return `${Math.floor(paise / 100)}${paise % 100 ? `.${String(paise % 100).padStart(2, "0")}` : ""}`;
}
export function toIstInput(instant: string | null) {
  return instant
    ? new Date(new Date(instant).getTime() + 330 * 60000).toISOString().slice(0, 16)
    : "";
}
export function fromIstInput(value: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Enter a valid date and time in IST.");
  const d = new Date(`${value}:00+05:30`);
  if (Number.isNaN(d.getTime()) || toIstInput(d.toISOString()) !== value)
    throw new Error("Enter a valid date and time in IST.");
  return d.toISOString();
}
export function mapsCoordinates(value: string): { lat: number; lng: number } | null {
  try {
    const url = new URL(value);
    if (!isGoogleMapsUrl(value)) return null;
    const query =
      url.searchParams.get("query") || url.searchParams.get("q") || url.searchParams.get("ll");
    const match =
      query?.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/) ||
      url.pathname.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) ||
      url.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (!match) return null;
    const lat = Number(match[1]),
      lng = Number(match[2]);
    return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
  } catch {
    return null;
  }
}
export function isGoogleMapsUrl(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      ((/^(www\.)?google\.(com|co\.in|co\.uk|com\.au|ca|de|fr|ae|com\.sg)$/.test(u.hostname) &&
        u.pathname.startsWith("/maps")) ||
        u.hostname === "maps.google.com" ||
        u.hostname === "maps.app.goo.gl" ||
        (u.hostname === "goo.gl" && u.pathname.startsWith("/maps")))
    );
  } catch {
    return false;
  }
}
export function openMaps(
  values: Pick<Values, "lat" | "lng" | "mapsUrl" | "venue" | "address" | "city">,
) {
  if (values.lat && values.lng)
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${values.lat},${values.lng}`)}`;
  if (isGoogleMapsUrl(values.mapsUrl)) return values.mapsUrl;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([values.venue, values.address, values.city].filter(Boolean).join(", "))}`;
}
export function statusLabel(
  status: string,
  endsAt: string | null,
  startsAt: string | null,
  now = Date.now(),
) {
  if (status === "ended" || (status === "published" && !!endsAt && Date.parse(endsAt) < now))
    return "Ended";
  void startsAt;
  return status === "published" ? "Published" : status === "cancelled" ? "Cancelled" : "Draft";
}
