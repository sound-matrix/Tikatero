import "server-only";

import { refundText } from "@/lib/discovery/model";
import { formatInr, formatIst } from "@/lib/format";
import { createServiceClient } from "@/lib/supabase/service";
import { buyerRefundDecision, refundCopy } from "./model";

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

export async function loadMyOrders(buyerId: string): Promise<MyOrderView[]> {
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
  const [
    { data: events, error: eventError },
    { data: tickets, error: ticketError },
    { data: refunds, error: refundError },
  ] = await Promise.all([
    client.from("events").select("id, title, starts_at, refund_policy").in("id", eventIds),
    client.from("tickets").select("order_id, status").in("order_id", orderIds),
    client
      .from("refunds")
      .select("id, order_id, amount_paise, status, created_at")
      .in("order_id", orderIds),
  ]);
  if (eventError || ticketError || refundError) throw new Error("Your orders could not be loaded.");
  const now = new Date();
  return orders.flatMap((order) => {
    if (order.buyer_id !== buyerId) return [];
    const event = events?.find((item) => item.id === order.event_id);
    if (!event?.starts_at) return [];
    const orderRefunds = (refunds ?? []).filter((refund) => refund.order_id === order.id);
    const processed = orderRefunds
      .filter((refund) => refund.status === "processed")
      .reduce((sum, refund) => sum + refund.amount_paise, 0);
    const decision = buyerRefundDecision({
      policy: event.refund_policy,
      startsAt: event.starts_at,
      now,
      orderStatus: order.status,
      buyerTotalPaise: order.total_paise,
      processedPaise: processed,
      ticketStatuses: (tickets ?? [])
        .filter((ticket) => ticket.order_id === order.id)
        .map((ticket) => ticket.status),
      openRefund: orderRefunds.some((refund) => ["requested", "approved"].includes(refund.status)),
    });
    return [
      {
        id: order.id,
        eventTitle: event.title,
        whenLabel: formatIst(event.starts_at),
        paidLabel: order.paid_at ? formatIst(order.paid_at) : "Not paid",
        totalLabel: `${formatInr(order.total_paise)} incl. GST`,
        statusLabel: orderLabels[order.status] ?? order.status,
        isTest: order.is_test,
        policyText: refundText(event.refund_policy),
        canRequest: decision.ok,
        requestReason: decision.ok ? "" : decision.reason,
        refunds: orderRefunds.map((refund) => ({
          id: refund.id,
          amountLabel: `${formatInr(refund.amount_paise)} incl. GST`,
          whenLabel: formatIst(refund.created_at),
          copy: refundCopy({ status: refund.status, isTest: order.is_test }),
        })),
      },
    ];
  });
}
