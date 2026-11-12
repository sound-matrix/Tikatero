import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { refundText } from "@/lib/discovery/model";
import { formatInr, formatIst } from "@/lib/format";
import { createServiceClient } from "@/lib/supabase/service";
import { loadEventSales } from "@/lib/payouts/read";

export type RefundDesk = {
  eventId: string;
  title: string;
  policyText: string;
  orders: {
    id: string;
    buyerName: string;
    status: string;
    totalLabel: string;
    totalPaise: number;
    paidLabel: string;
    isTest: boolean;
    remainingLabel: string;
    remainingRupees: string;
    tickets: { id: string; code: string; status: string; refundable: boolean }[];
    refunds: {
      id: string;
      status: string;
      amountLabel: string;
      whenLabel: string;
      open: boolean;
      queued: boolean;
    }[];
  }[];
};

function rupeesInput(paise: number) {
  const whole = Math.floor(paise / 100);
  const rest = paise % 100;
  return rest === 0 ? String(whole) : `${whole}.${String(rest).padStart(2, "0")}`;
}

export async function loadRefundDesk(
  client: SupabaseClient<Database>,
  eventId: string,
): Promise<RefundDesk | null> {
  const sales = await loadEventSales(client, eventId);
  if (!sales) return null;
  const service = createServiceClient();
  const { data: event, error } = await service
    .from("events")
    .select("id, title, refund_policy, status, starts_at")
    .eq("id", eventId)
    .maybeSingle();
  if (error || !event) return null;
  const { data: orders, error: orderError } = await service
    .from("orders")
    .select("id, buyer_name, status, total_paise, paid_at, is_test")
    .eq("event_id", eventId)
    .in("status", ["paid", "partially_refunded", "refunded"])
    .order("paid_at", { ascending: false });
  if (orderError) throw new Error("Refunds could not be loaded.");
  const ids = (orders ?? []).map((order) => order.id);
  const [{ data: tickets }, { data: refunds }] = await Promise.all([
    ids.length
      ? service.from("tickets").select("id, order_id, code, status").in("order_id", ids)
      : Promise.resolve({ data: [] }),
    ids.length
      ? service
          .from("refunds")
          .select("id, order_id, amount_paise, status, created_at, cf_refund_id")
          .in("order_id", ids)
      : Promise.resolve({ data: [] }),
  ]);
  return {
    eventId,
    title: event.title,
    policyText: refundText(event.refund_policy),
    orders: (orders ?? []).map((order) => {
      const orderRefunds = (refunds ?? []).filter((refund) => refund.order_id === order.id);
      const processed = orderRefunds
        .filter((refund) => refund.status === "processed")
        .reduce((sum, refund) => sum + refund.amount_paise, 0);
      const remaining = Math.max(0, order.total_paise - processed);
      return {
        id: order.id,
        buyerName: order.buyer_name,
        status: order.status,
        totalPaise: order.total_paise,
        totalLabel: `${formatInr(order.total_paise)} incl. GST`,
        paidLabel: order.paid_at ? formatIst(order.paid_at) : "Not paid",
        isTest: order.is_test,
        remainingLabel: `${formatInr(remaining)} incl. GST`,
        remainingRupees: rupeesInput(remaining),
        tickets: (tickets ?? [])
          .filter((ticket) => ticket.order_id === order.id)
          .map((ticket) => ({
            id: ticket.id,
            code: ticket.code,
            status: ticket.status,
            refundable: ticket.status === "valid" || ticket.status === "transferred",
          })),
        refunds: orderRefunds.map((refund) => ({
          id: refund.id,
          status: refund.status,
          amountLabel: `${formatInr(refund.amount_paise)} incl. GST`,
          whenLabel: formatIst(refund.created_at),
          open: refund.status === "requested",
          queued:
            event.status === "cancelled" && refund.status === "approved" && !refund.cf_refund_id,
        })),
      };
    }),
  };
}
