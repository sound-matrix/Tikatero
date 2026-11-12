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
  qty_held: z.number().int().nonnegative().optional(),
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
const count = z.number().int().nonnegative();
const liveTierSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  price_paise: paise,
  sold: count,
  left: count,
  qty_held: count,
  money_paise: paise,
  share_paise: paise,
  checked_in: count,
});
const daySchema = z.object({ date: z.string(), money_paise: paise, orders: count });
export const liveSalesSchema = z.object({
  venue: z.string().nullable(),
  capacity: count.nullable(),
  seats_left: count.nullable(),
  tickets_sold: count,
  tickets_left: count,
  qty_held: count,
  checked_in: count,
  refunded_tickets: count,
  refunded_paise: paise,
  refund_count: count,
  refund_requests_pending: count,
  ticket_money_paise: paise,
  buyer_paid_paise: paise,
  fee_paise: paise,
  fee_gst_paise: paise,
  gateway_paise: paise,
  organiser_refunds_paise: paise,
  share_paise: paise,
  paid_out_paise: paise,
  to_be_paid_paise: paise,
  on_hold_paise: paise,
  expected_at: z.string().nullable(),
  ticket_types: z.array(liveTierSchema),
  sales_by_day: z.array(daySchema),
  channels: z.array(z.object({ channel: z.string(), bookings: count })).optional(),
});
export type LiveSales = z.infer<typeof liveSalesSchema>;
const excelRowsSchema = z.object({
  orders: z.array(
    z.object({
      id: z.string(),
      paid_at: z.string(),
      ticket_types: z.string(),
      qty: count,
      subtotal_paise: paise,
      platform_fee_paise: paise,
      platform_fee_gst_paise: paise,
      gateway_fee_paise: paise,
      refund_paise: paise,
      share_paise: paise,
      status: z.string(),
    }),
  ),
  payouts: z.array(
    z.object({
      created_at: z.string(),
      settled_at: z.string().nullable(),
      expected_at: z.string().nullable(),
      amount_paise: paise,
      status: z.string(),
    }),
  ),
});
export type ExcelRows = z.infer<typeof excelRowsSchema>;

export const eventSalesSchema = z.object({
  id: z.uuid(),
  organiser_id: z.uuid(),
  title: z.string(),
  starts_at: z.string().nullable(),
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
  live: liveSalesSchema,
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

export async function loadEventExcelRows(
  client: Client,
  eventId: string,
  staff: boolean,
  includeOrders = true,
) {
  const { data, error } = await client.rpc("event_excel_rows", {
    p_event_id: eventId,
    p_staff: staff,
    p_include_orders: includeOrders,
  });
  if (error) throw new Error("Event orders and payouts could not be exported.");
  return excelRowsSchema.parse(data);
}
