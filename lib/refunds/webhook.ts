import { providerPaise } from "@/lib/payments/model";

export type RefundWebhookCommand = {
  error: null;
  refundId: string;
  orderId: string;
  cfRefundId: string;
  amountPaise: number;
  outcome: "processed" | "pending" | "failed";
};

/** Null when this body is not a refund webhook. Invalid once the type matches but the body does not. */
export function refundWebhookCommand(
  body: unknown,
): RefundWebhookCommand | { error: "invalid" } | null {
  if (!body || typeof body !== "object") return null;
  if ((body as { type?: unknown }).type !== "REFUND_STATUS_WEBHOOK") return null;
  const refund = (body as { data?: { refund?: Record<string, unknown> } }).data?.refund;
  if (!refund) return { error: "invalid" };
  const refundId = refund.refund_id;
  const orderId = refund.order_id;
  const cf = refund.cf_refund_id;
  const status = refund.refund_status;
  if (typeof refundId !== "string" || !/^[0-9a-f-]{36}$/i.test(refundId))
    return { error: "invalid" };
  if (typeof orderId !== "string" || !/^[0-9a-f-]{36}$/i.test(orderId)) return { error: "invalid" };
  if (typeof cf !== "string" && typeof cf !== "number") return { error: "invalid" };
  const cfRefundId = String(cf);
  if (!/^[A-Za-z0-9:_-]{4,120}$/.test(cfRefundId)) return { error: "invalid" };
  let amountPaise: number;
  try {
    amountPaise = providerPaise(refund.refund_amount);
  } catch {
    return { error: "invalid" };
  }
  const outcome =
    status === "SUCCESS"
      ? "processed"
      : status === "PENDING" || status === "ONHOLD"
        ? "pending"
        : status === "FAILED" || status === "CANCELLED"
          ? "failed"
          : null;
  if (!outcome) return { error: "invalid" };
  return { error: null, refundId, orderId, cfRefundId, amountPaise, outcome };
}
