import "server-only";

import { send } from "@/lib/email/send";
import { createServiceClient } from "@/lib/supabase/service";

export async function notifyRefundProcessed(refundId: string, testRefund: boolean) {
  const service = createServiceClient();
  const { data: refund, error } = await service
    .from("refunds")
    .select("id, amount_paise, status, order_id")
    .eq("id", refundId)
    .maybeSingle();
  if (error || !refund || refund.status !== "processed") return null;
  const { data: order, error: orderError } = await service
    .from("orders")
    .select("id, buyer_email, buyer_name, event_id, is_test")
    .eq("id", refund.order_id)
    .maybeSingle();
  if (orderError || !order) return null;
  const { data: event, error: eventError } = await service
    .from("events")
    .select("title")
    .eq("id", order.event_id)
    .maybeSingle();
  if (eventError || !event) return null;
  return send({
    template: "refund_processed",
    entityRef: `refund/${refund.id}/processed`,
    to: order.buyer_email,
    data: {
      recipientName: order.buyer_name,
      eventTitle: event.title,
      refundRef: refund.id,
      amountPaise: refund.amount_paise,
      testRefund: testRefund || order.is_test,
      actionPath: "/me",
    },
  });
}

export async function notifyEventCancelled(input: {
  eventId: string;
  eventTitle: string;
  buyerEmail: string;
  buyerName: string;
  reason: string;
  free?: boolean;
}) {
  return send({
    template: "event_cancelled",
    entityRef: `event/${input.eventId}/cancelled/${input.buyerEmail}`.slice(0, 200),
    to: input.buyerEmail,
    data: {
      recipientName: input.buyerName,
      eventTitle: input.eventTitle,
      reason: input.reason,
      free: input.free,
      actionPath: "/me",
    },
  });
}

export async function notifyRefundRejected(refundId: string) {
  const service = createServiceClient();
  const { data: refund, error } = await service
    .from("refunds")
    .select(
      "status, decided_reason, orders!inner(buyer_email, buyer_name, is_test, events!inner(title))",
    )
    .eq("id", refundId)
    .maybeSingle();
  if (error || !refund || refund.status !== "rejected" || !refund.decided_reason) return null;
  return send({
    template: "refund_request_rejected",
    entityRef: `refund/${refundId}/rejected`,
    to: refund.orders.buyer_email,
    data: {
      recipientName: refund.orders.buyer_name,
      eventTitle: refund.orders.events.title,
      reason: refund.decided_reason,
    },
  });
}
