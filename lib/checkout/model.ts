import { z } from "zod";
import type { Database } from "@/lib/db/types";
export const checkoutSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(160),
  quotedTotal: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  pricingVersionId: z.uuid(),
  name: z.string().trim().min(2).max(120),
  email: z
    .email()
    .max(254)
    .transform((v) => v.trim().toLowerCase()),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9][0-9]{9}$/, "Enter a 10-digit Indian mobile number."),
  lines: z
    .array(z.object({ id: z.uuid(), qty: z.number().int().min(1).max(50) }))
    .min(1)
    .max(30)
    .refine(
      (lines) => new Set(lines.map((l) => l.id)).size === lines.length,
      "Choose each tier once.",
    )
    .refine(
      (lines) => lines.reduce((n, l) => n + l.qty, 0) <= 50,
      "Choose up to 50 tickets per order.",
    ),
  attendees: z.array(z.string().trim().max(120)).max(50).default([]),
  consent: z.literal(true, { error: "Please agree to the terms and privacy policy." }),
  turnstile: z.string().max(2048).default(""),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type CheckoutTier = Database["public"]["Tables"]["ticket_types"]["Row"];
export type CheckoutOrder = Database["public"]["Tables"]["orders"]["Row"];
export function tierUnavailable(tier: CheckoutTier, now: number) {
  if (tier.qty_sold >= tier.qty_total) return "Sold out";
  if (tier.sales_start && Date.parse(tier.sales_start) > now) return "Not on sale yet";
  if (tier.sales_end && Date.parse(tier.sales_end) <= now) return "Sales closed";
  return "";
}
export type CheckoutResult = {
  error?: string;
  url?: string;
  payment?: { sessionId: string; mode: "sandbox" | "production" };
};
