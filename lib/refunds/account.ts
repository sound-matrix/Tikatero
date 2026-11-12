import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { loadBuyerQuote, readRefundPolicyText } from "./read";
import { formatInr, formatIst } from "@/lib/format";
import { createServiceClient } from "@/lib/supabase/service";
import { refundCopy } from "./model";

export type MyOrderView = {
  id: string;
  eventTitle: string;
  whenLabel: string;
  paidLabel: string;
  totalLabel: string;
  statusLabel: string;
  isTest: boolean;
  policyText: string;
  canRequest: boolean;
  requestReason: string;
  paused: boolean;
  refunds: {
    id: string;
    amountLabel: string;
    whenLabel: string;
    copy: string;
  }[];
};

const orderLabels: Record<string, string> = {
  paid: "Paid",
  refunded: "Refunded",
  partially_refunded: "Partly refunded",
  failed: "Payment failed",
  expired: "Expired",
};

export async function loadMyOrders(
  buyerId: string,
  session: SupabaseClient<Database>,
): Promise<MyOrderView[]> {
  const client = createServiceClient();
  const { data: orders, error } = await client
    .from("orders")
    .select("id, event_id, status, total_paise, paid_at, created_at, is_test, buyer_id")
    .eq("buyer_id", buyerId)
    .in("status", ["paid", "refunded", "partially_refunded", "failed", "expired"])
    .order("created_at", { ascending: false });
  if (error) throw new Error("Your orders could not be loaded.");
  if (!orders?.length) return [];
  const eventIds = [...new Set(orders.map((order) => order.event_id))];
  const orderIds = orders.map((order) => order.id);
  const [{ data: events, error: eventError }, { data: refunds, error: refundError }] =
    await Promise.all([
      client.from("events").select("id, title, starts_at, refund_policy").in("id", eventIds),
      client
        .from("refunds")
        .select("id, order_id, amount_paise, status, created_at, cf_refund_id")
        .in("order_id", orderIds),
    ]);
  if (eventError || refundError) throw new Error("Your orders could not be loaded.");
  const result = await Promise.all(
    orders.map(async (order) => {
      if (order.buyer_id !== buyerId) return null;
      const event = events?.find((item) => item.id === order.event_id);
      if (!event?.starts_at) return null;
      const orderRefunds = (refunds ?? []).filter((refund) => refund.order_id === order.id);

      const [decision, policyText] = await Promise.all([
        loadBuyerQuote(session, order.id),
        readRefundPolicyText(client, event.id, event.refund_policy),
      ]);
      return {
        id: order.id,
        eventTitle: event.title,
        whenLabel: formatIst(event.starts_at),
        paidLabel: order.paid_at ? formatIst(order.paid_at) : "Not paid",
        totalLabel: `${formatInr(order.total_paise)} incl. GST`,
        statusLabel: orderLabels[order.status] ?? order.status,
        isTest: order.is_test,
        policyText,
        canRequest: !!decision.quote,
        requestReason: decision.message,
        paused: decision.quote?.paused ?? false,
        refunds: orderRefunds.map((refund) => ({
          id: refund.id,
          amountLabel: `${formatInr(refund.amount_paise)} incl. GST`,
          whenLabel: formatIst(refund.created_at),
          copy:
            refund.status === "approved" && !refund.cf_refund_id
              ? "Your refund was approved and is waiting to be sent."
              : refundCopy({ status: refund.status, isTest: order.is_test }),
        })),
      };
    }),
  );
  return result.filter((order) => order !== null);
}
