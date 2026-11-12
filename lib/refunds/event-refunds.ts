import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { refundPaymentsReady, settleOpenedRefund } from "./complete";
import { notifyEventCancelled } from "./notify";

export async function cancellationReason(eventId: string) {
  const { data, error } = await createServiceClient()
    .from("audit_log")
    .select("reason")
    .eq("entity", "events")
    .eq("entity_id", eventId)
    .eq("action", "event_cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.reason || "The event was cancelled.";
}

export async function processEventRefunds(
  event: { id: string; title: string },
  reason: string,
  orderId?: string,
) {
  const service = createServiceClient();
  const seen = new Set<string>();
  let queued = false;
  // A completed partial refund can open a second refund for the rest.
  for (let offset = 0; ; offset += 200) {
    let query = service
      .from("orders")
      .select("id,buyer_email,buyer_name,status,total_paise,is_test")
      .eq("event_id", event.id)
      .not("paid_at", "is", null)
      .order("id")
      .range(offset, offset + 199);
    if (orderId) query = query.eq("id", orderId);
    const { data: orders, error } = await query;
    if (error) throw error;
    for (const order of orders) {
      const email = order.buyer_email.toLowerCase();
      if (!seen.has(email) && !email.endsWith("@users.invalid")) {
        seen.add(email);
        await notifyEventCancelled({
          eventId: event.id,
          eventTitle: event.title,
          buyerName: order.buyer_name,
          buyerEmail: order.buyer_email,
          reason,
          free: order.total_paise === 0,
        }).catch(() => null);
      }
      if (order.total_paise <= 0 || order.status === "refunded") continue;
      if (!refundPaymentsReady(order.is_test)) {
        queued = true;
        continue;
      }
      for (let attempt = 0; attempt < 2; attempt++) {
        const { data: refund, error: refundError } = await service
          .from("refunds")
          .select("id,amount_paise,organiser_reversal_paise,cf_refund_id")
          .eq("order_id", order.id)
          .eq("status", "approved")
          .maybeSingle();
        if (refundError) throw refundError;
        if (!refund) break;
        if (refund.cf_refund_id) {
          queued = true;
          break;
        }
        try {
          await settleOpenedRefund(
            {
              refund_id: refund.id,
              order_id: order.id,
              amount_paise: refund.amount_paise,
              reversal_paise: refund.organiser_reversal_paise,
              needs_provider: true,
              is_test: order.is_test,
            },
            true,
          );
        } catch {
          queued = true;
          break;
        }
      }
    }
    if (orders.length < 200) break;
  }
  return queued;
}

export async function processCancelledOrder(order: { id: string; event_id: string }) {
  const service = createServiceClient();
  const { data, error } = await service
    .from("events")
    .select("id,title")
    .eq("id", order.event_id)
    .eq("status", "cancelled")
    .maybeSingle();
  if (error) throw error;
  if (!data) return false;
  await processEventRefunds(data, await cancellationReason(data.id), order.id);
  return true;
}

export async function sweepEventRefunds() {
  const { data, error } = await createServiceClient().rpc("queued_event_refunds", { p_limit: 100 });
  if (error) throw error;
  let failed = 0;
  for (let index = 0; index < data.length; index += 5) {
    const results = await Promise.allSettled(
      data.slice(index, index + 5).map(processCancelledOrder),
    );
    failed += results.filter((result) => result.status === "rejected").length;
  }
  return failed;
}
