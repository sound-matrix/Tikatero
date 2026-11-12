import { createHmac, timingSafeEqual } from "node:crypto";
import type { CheckoutMethod } from "@/lib/db/account-schema";
import { parseHundredths } from "@/lib/pricing/settings";
export type ProviderOrder = {
  id: string;
  customer_id?: string;
  preferred_method?: CheckoutMethod;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  total_paise: number;
  organiser_share_paise: number;
  vendor_id: string | null;
  hold_expires_at: string;
};
export type PaymentState = "paid" | "failed" | "expired" | "pending";
export type PaymentResult = {
  state: PaymentState;
  amount: number;
  currency: string;
  paymentId?: string;
};
export type ProviderRefund = {
  refundId: string;
  orderId: string;
  amountPaise: number;
  reversalPaise: number;
  vendorId: string | null;
  note: string;
};
export type ProviderRefundResult = {
  cfRefundId: string;
  status: "processed" | "pending" | "failed";
};
export interface PaymentProvider {
  mode: "mock" | "cashfree";
  create(order: ProviderOrder, origin: string): Promise<{ sessionId: string }>;
  get(order: ProviderOrder): Promise<PaymentResult>;
  refund(input: ProviderRefund): Promise<ProviderRefundResult>;
}
/** Only the provider boundary uses rupee decimals. The ledger remains integer paise. */
export function rupees(paise: number) {
  if (!Number.isSafeInteger(paise) || paise < 0) throw new Error("Invalid payment amount.");
  const amount = Number(`${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`);
  if (parseHundredths(String(amount)) !== paise)
    throw new Error("Payment amount exceeds provider precision.");
  return amount;
}
export function providerPaise(value: unknown) {
  if (typeof value !== "number" && typeof value !== "string")
    throw new Error("Invalid provider amount.");
  return parseHundredths(String(value));
}
const cashfreeMethods = { upi: "upi", card: "cc,dc", netbanking: "nb" } as const;

export function cashfreeBody(order: ProviderOrder, origin: string) {
  if (
    !order.vendor_id ||
    order.organiser_share_paise <= 0 ||
    order.organiser_share_paise > order.total_paise
  )
    throw new Error("This organiser is not ready to accept payments.");
  if (order.total_paise < 100) throw new Error("Cashfree payments must be at least ₹ 1.");
  return {
    order_id: order.id,
    order_amount: rupees(order.total_paise),
    order_currency: "INR",
    order_expiry_time: order.hold_expires_at,
    customer_details: {
      customer_id: order.customer_id ?? order.id,
      customer_name: order.buyer_name,
      customer_email: order.buyer_email,
      customer_phone: order.buyer_phone,
    },
    order_meta: {
      return_url: `${origin}/orders/${order.id}/status`,
      notify_url: `${origin}/api/cashfree/webhook`,
      ...(order.preferred_method && order.preferred_method !== "ask"
        ? { payment_methods: cashfreeMethods[order.preferred_method] }
        : {}),
    },
    order_splits: [{ vendor: order.vendor_id, amount: rupees(order.organiser_share_paise) }],
  };
}
/** Easy Split refund. The buyer amount is what they paid; the vendor amount is the reversed organiser share. */
export function cashfreeRefundBody(input: ProviderRefund) {
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0)
    throw new Error("Invalid refund amount.");
  if (
    !Number.isSafeInteger(input.reversalPaise) ||
    input.reversalPaise < 0 ||
    input.reversalPaise > input.amountPaise
  )
    throw new Error("Invalid refund split.");
  const note = input.note.replace(/[\u0000-\u001f]/g, "").slice(0, 100);
  const body: {
    refund_id: string;
    refund_amount: number;
    refund_note: string;
    refund_splits?: { vendor_id: string; amount: number }[];
  } = {
    refund_id: input.refundId,
    refund_amount: rupees(input.amountPaise),
    refund_note: note || "Refund",
  };
  if (input.vendorId && input.reversalPaise > 0)
    body.refund_splits = [{ vendor_id: input.vendorId, amount: rupees(input.reversalPaise) }];
  return body;
}
/** Verify before JSON parsing, using the exact raw bytes and constant-time comparison. */
export function verifyWebhook(
  raw: string,
  timestamp: string | null,
  signature: string | null,
  secret: string,
) {
  if (
    !secret ||
    !timestamp ||
    !/^\d{10,16}$/.test(timestamp) ||
    !signature ||
    !/^[A-Za-z0-9+/]{43}=$/.test(signature)
  )
    return false;
  const expected = createHmac("sha256", secret).update(timestamp).update(raw).digest();
  const actual = Buffer.from(signature, "base64");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function mockConfirmationAllowed(env: { NODE_ENV?: string; PAYMENTS_ALLOW_MOCK?: string }) {
  return env.NODE_ENV !== "production" || env.PAYMENTS_ALLOW_MOCK === "true";
}
export const PAYMENTS_UNAVAILABLE =
  "Online payments are not available yet. Please check back soon.";
/**
 * Production must not silently select mock. Vercel preview and `vercel dev`
 * still may: those runtimes set NODE_ENV=production, so VERCEL_ENV wins.
 */
export function productionPaymentLock(
  env: { NODE_ENV?: string; VERCEL_ENV?: string } = process.env,
) {
  if (env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "development") return false;
  return env.VERCEL_ENV === "production" || env.NODE_ENV === "production";
}
/** Mock orders are never live charges. Sandbox Cashfree orders stay marked too. */
export function orderIsTest(
  mode: "mock" | "cashfree" | "free",
  env: { NODE_ENV?: string; CASHFREE_ENV?: string } = process.env,
) {
  if (mode === "free") return false;
  if (mode === "mock") return true;
  return env.CASHFREE_ENV !== "production";
}
