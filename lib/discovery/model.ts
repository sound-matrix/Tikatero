import { z } from "zod";
import { categories } from "@/lib/events/model";
import { formatInr } from "@/lib/format";
export type Search = Record<string, string | string[] | undefined>;
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v)
  .catch("");
const text = z.string().trim().max(100).catch("");
export const filterSchema = z.object({
  q: text.default(""),
  city: text.default(""),
  country: z
    .union([z.literal(""), z.string().regex(/^[A-Z]{2}$/)])
    .catch("")
    .default(""),
  category: z
    .union([z.literal(""), z.enum(categories)])
    .catch("")
    .default(""),
  price: z.enum(["", "free", "paid"]).catch("").default(""),
  from: date.default(""),
  to: date.default(""),
  page: z.coerce.number().int().min(1).max(1000).catch(1).default(1),
});
export type Filters = z.infer<typeof filterSchema>;
export function filters(input: Search): Filters {
  const parsed = filterSchema.parse(
    Object.fromEntries(Object.entries(input).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
  );
  if (parsed.from && parsed.to && parsed.to < parsed.from)
    [parsed.from, parsed.to] = [parsed.to, parsed.from];
  return parsed;
}
export function listingUrl(input: Partial<Filters>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(input))
    if (v && !(k === "page" && v === 1)) params.set(k, String(v));
  return `/events${params.size ? `?${params}` : ""}`;
}
export function istDayStart(day: string) {
  return new Date(`${day}T00:00:00+05:30`).toISOString();
}
export function istDayEnd(day: string) {
  return new Date(Date.parse(istDayStart(day)) + 86400000).toISOString();
}
export function publicPrice(paise: number | null, free = false) {
  return free
    ? "Free — RSVP"
    : paise === null
      ? "Tickets coming soon"
      : `${formatInr(paise).replace("₹", "₹ ")} incl. GST`;
}
export type Tier = {
  id: string;
  name: string;
  price_paise: number;
  qty_total: number;
  qty_sold: number;
  sales_start: string | null;
  sales_end: string | null;
  is_vip: boolean;
};
export type Guest = {
  name: string;
  title: string | null;
  photo_key: string | null;
  is_vip: boolean;
};
export function tierState(tier: Tier, eventEnds: string, now = Date.now()) {
  if (Date.parse(eventEnds) <= now) return "Event ended";
  if (tier.qty_sold >= tier.qty_total) return "Sold out";
  if (tier.sales_start && Date.parse(tier.sales_start) > now) return "Not on sale yet";
  if (tier.sales_end && Date.parse(tier.sales_end) <= now) return "Sales closed";
  return "Available";
}
export function refundText(policy: string) {
  return policy === "72h"
    ? "Full refund up to 72 hours before the event starts."
    : policy === "none"
      ? "No refunds for this event."
      : policy.replace(/^custom: /, "");
}
export function jsonLdString(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
