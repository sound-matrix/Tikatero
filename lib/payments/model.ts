import { createHmac, timingSafeEqual } from "node:crypto";
import { parseHundredths } from "@/lib/pricing/settings";
export type ProviderOrder = {
  id: string;
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
export interface PaymentProvider {
  mode: "mock" | "cashfree";
  create(order: ProviderOrder, origin: string): Promise<{ sessionId: string }>;
  get(order: ProviderOrder): Promise<PaymentResult>;
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
      customer_id: order.id,
      customer_name: order.buyer_name,
      customer_email: order.buyer_email,
      customer_phone: order.buyer_phone,
    },
    order_meta: {
      return_url: `${origin}/orders/${order.id}/status`,
      notify_url: `${origin}/api/cashfree/webhook`,
    },
    order_splits: [{ vendor: order.vendor_id, amount: rupees(order.organiser_share_paise) }],
  };
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
