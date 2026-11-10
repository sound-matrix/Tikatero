import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

const paise = z
  .number()
  .int()
  .refine((value) => Number.isSafeInteger(value));
const tierSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  is_vip: z.boolean(),
  qty_sold: z.number().int().nonnegative(),
  qty_total: z.number().int().nonnegative(),
  price_paise: paise,
  sold_real: z.number().int().nonnegative(),
  checked_in: z.number().int().nonnegative(),
});
const orderSchema = z.object({
  id: z.uuid(),
  paid_at: z.string().nullable(),
  subtotal_paise: paise,
  platform_fee_paise: paise,
  platform_fee_gst_paise: paise,
  gateway_fee_paise: paise,
  organiser_share_paise: paise,
  platform_share_paise: paise,
  buyer_total_paise: paise,
});
export const eventSalesSchema = z.object({
  id: z.uuid(),
  organiser_id: z.uuid(),
  title: z.string(),
  starts_at: z.string(),
  ends_at: z.string().nullable(),
  status: z.string(),
  is_free: z.boolean(),
  gross_subtotal_paise: paise,
  buyer_total_paise: paise,
  platform_fee_paise: paise,
  platform_fee_gst_paise: paise,
  gateway_fee_paise: paise,
  organiser_share_paise: paise,
  tickets_sold: z.number().int().nonnegative(),
  checked_in: z.number().int().nonnegative(),
  to_be_paid_paise: z.number().int().nonnegative(),
  payout_days: z.number().int().nonnegative(),
  identity_ok: z.boolean(),
  checkins_from_scanner: z.boolean(),
  tiers: z.array(tierSchema),
  orders: z.array(orderSchema),
});
const dashboardSchema = z.object({
  organisers: z.array(
    z.object({
      id: z.uuid(),
      display_name: z.string(),
      events: z.array(eventSalesSchema),
    }),
  ),
});
export type EventSales = z.infer<typeof eventSalesSchema>;
export type OrganiserDashboard = z.infer<typeof dashboardSchema>;

type Client = SupabaseClient<Database>;

export async function loadDashboard(client: Client): Promise<OrganiserDashboard> {
  const { data, error } = await client.rpc("organiser_dashboard");
  if (error) throw new Error("Your sales could not be loaded. Try again.");
  const parsed = dashboardSchema.safeParse(data);
  if (!parsed.success) throw new Error("Your sales could not be loaded. Try again.");
  return parsed.data;
}

export async function loadEventSales(client: Client, eventId: string): Promise<EventSales | null> {
  const { data, error } = await client.rpc("organiser_event_sales", { p_event_id: eventId });
  if (error?.code === "42501" || error?.message?.includes("cannot view sales")) return null;
  if (error) throw new Error("This event's sales could not be loaded. Try again.");
  const parsed = eventSalesSchema.safeParse(data);
  if (!parsed.success) throw new Error("This event's sales could not be loaded. Try again.");
  return parsed.data;
}
