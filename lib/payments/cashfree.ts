import "server-only";
import {
  cashfreeBody,
  cashfreeRefundBody,
  providerPaise,
  type PaymentProvider,
  type ProviderOrder,
  type ProviderRefund,
  type ProviderRefundResult,
  type PaymentResult,
} from "./model";
export const CASHFREE_API_VERSION = "2026-01-01";
class CashfreeError extends Error {
  constructor(readonly status: number) {
    super("Payment service is temporarily unavailable. Please try again.");
  }
}
export class Cashfree implements PaymentProvider {
  readonly mode = "cashfree" as const;
  private async request(path: string, init?: RequestInit) {
    const base =
      process.env.CASHFREE_ENV === "production"
        ? "https://api.cashfree.com/pg"
        : "https://sandbox.cashfree.com/pg";
    const response = await fetch(`${base}${path}`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        "x-api-version": CASHFREE_API_VERSION,
        "x-client-id": process.env.CASHFREE_APP_ID!,
        "x-client-secret": process.env.CASHFREE_SECRET_KEY!,
        ...init?.headers,
      },
    });
    // Do not expose/log provider bodies: they can contain customer/payment data.
    if (!response.ok) throw new CashfreeError(response.status);
    return response.json();
  }
  async create(order: ProviderOrder, origin: string) {
    const result = await this.request("/orders", {
      method: "POST",
      headers: { "x-idempotency-key": order.id },
      body: JSON.stringify(cashfreeBody(order, origin)),
    });
    if (
      result.order_id !== order.id ||
      result.order_currency !== "INR" ||
      providerPaise(result.order_amount) !== order.total_paise ||
      typeof result.payment_session_id !== "string"
    )
      throw new Error("Payment service returned an invalid order.");
    return { sessionId: result.payment_session_id };
  }
  async get(order: ProviderOrder): Promise<PaymentResult> {
    let result;
    try {
      result = await this.request(`/orders/${encodeURIComponent(order.id)}`);
    } catch (error) {
      if (
        error instanceof CashfreeError &&
        error.status === 404 &&
        Date.parse(order.hold_expires_at) <= Date.now()
      )
        return { state: "expired", amount: order.total_paise, currency: "INR" };
      throw error;
    }
    if (result.order_id !== order.id) throw new Error("Payment order does not match.");
    return {
      state:
        result.order_status === "PAID"
          ? "paid"
          : ["EXPIRED", "TERMINATED"].includes(result.order_status)
            ? "expired"
            : "pending",
      amount: providerPaise(result.order_amount),
      currency: result.order_currency,
    };
  }
  async refund(input: ProviderRefund): Promise<ProviderRefundResult> {
    const result = await this.request(`/orders/${encodeURIComponent(input.orderId)}/refunds`, {
      method: "POST",
      headers: { "x-idempotency-key": input.refundId },
      body: JSON.stringify(cashfreeRefundBody(input)),
    });
    const id = result.cf_refund_id;
    if (
      (typeof id !== "string" && typeof id !== "number") ||
      providerPaise(result.refund_amount) !== input.amountPaise
    )
      throw new Error("Refund service returned an invalid refund.");
    const status = String(result.refund_status ?? "").toUpperCase();
    const cfRefundId = String(id);
    if (status === "SUCCESS") return { cfRefundId, status: "processed" };
    if (status === "PENDING" || status === "ONHOLD") return { cfRefundId, status: "pending" };
    return { cfRefundId, status: "failed" };
  }
}
