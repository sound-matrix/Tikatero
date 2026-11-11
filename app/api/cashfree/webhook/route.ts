import { createHash } from "node:crypto";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyWebhook, providerPaise } from "@/lib/payments/model";
import { transition } from "@/lib/checkout/store";
import { applySettlement, settlementCommand } from "@/lib/payouts/settle";
import { applyRefundWebhook } from "@/lib/refunds/complete";
import { refundWebhookCommand } from "@/lib/refunds/webhook";
import { allowRequest, requestIpFrom } from "@/lib/security/rate-limit";
const schema = z.object({
  type: z.enum([
    "PAYMENT_SUCCESS_WEBHOOK",
    "PAYMENT_FAILED_WEBHOOK",
    "PAYMENT_USER_DROPPED_WEBHOOK",
  ]),
  data: z.object({
    order: z.object({
      order_id: z.uuid(),
      order_amount: z.union([z.number(), z.string()]),
      order_currency: z.literal("INR"),
    }),
    payment: z.object({
      cf_payment_id: z.union([z.string(), z.number()]),
      payment_status: z.enum(["SUCCESS", "FAILED", "USER_DROPPED"]),
      payment_amount: z.union([z.number(), z.string()]),
      payment_currency: z.literal("INR"),
    }),
  }),
});
export async function POST(request: Request) {
  const raw = await request.text();
  const secret = process.env.CASHFREE_WEBHOOK_SECRET || process.env.CASHFREE_SECRET_KEY || "";
  if (
    !verifyWebhook(
      raw,
      request.headers.get("x-webhook-timestamp"),
      request.headers.get("x-webhook-signature"),
      secret,
    )
  )
    return new Response(null, { status: 401 });
  if (!(await allowRequest("webhook", requestIpFrom(request), 120, 60)))
    return new Response(null, { status: 429 });
  try {
    const json = JSON.parse(raw);
    const settlement = settlementCommand(json);
    if (settlement?.error === "invalid") return new Response(null, { status: 400 });
    if (settlement) {
      await applySettlement(settlement);
      return Response.json({ received: true });
    }
    const refund = refundWebhookCommand(json);
    if (refund?.error === "invalid") return new Response(null, { status: 400 });
    if (refund) {
      try {
        await applyRefundWebhook(refund);
      } catch (error) {
        if (error instanceof Error && error.message === "invalid")
          return new Response(null, { status: 400 });
        return new Response(null, { status: 503 });
      }
      return Response.json({ received: true });
    }
    if (
      ![
        "PAYMENT_SUCCESS_WEBHOOK",
        "PAYMENT_FAILED_WEBHOOK",
        "PAYMENT_USER_DROPPED_WEBHOOK",
      ].includes(json.type)
    )
      return Response.json({ received: true });
    const parsed = schema.safeParse(json);
    if (!parsed.success) return new Response(null, { status: 400 });
    const { type, data } = parsed.data;
    const state =
      type === "PAYMENT_SUCCESS_WEBHOOK"
        ? "paid"
        : type === "PAYMENT_FAILED_WEBHOOK"
          ? "failed"
          : "failed";
    const expected =
      type === "PAYMENT_SUCCESS_WEBHOOK"
        ? "SUCCESS"
        : type === "PAYMENT_FAILED_WEBHOOK"
          ? "FAILED"
          : "USER_DROPPED";
    if (data.payment.payment_status !== expected) return new Response(null, { status: 400 });
    const { data: order, error } = await createServiceClient()
      .from("orders")
      .select("*")
      .eq("cf_order_id", data.order.order_id)
      .maybeSingle();
    if (error) return new Response(null, { status: 503 });
    if (!order) return new Response(null, { status: 404 });
    const amount = providerPaise(data.order.order_amount);
    if (amount !== providerPaise(data.payment.payment_amount) || amount !== order.total_paise)
      return new Response(null, { status: 400 });
    const paymentId = String(data.payment.cf_payment_id);
    // Do not persist card/UPI/customer details from the original webhook.
    await transition(
      order,
      { state, amount, currency: "INR", paymentId },
      {
        id: createHash("sha256")
          .update(`${data.order.order_id}:${paymentId}:${expected}`)
          .digest("hex"),
        payload: { type, order_id: order.id, payment_id: paymentId, amount_paise: amount },
      },
    );
    return Response.json({ received: true });
  } catch {
    return new Response(null, { status: 503 });
  }
}
