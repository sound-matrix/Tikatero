import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { PaymentGateway, PaymentResult, ProviderOrder, ProviderRefund, ProviderRefundResult } from "./model";
import { providerPaise } from "./model";

const digest = (value: string) => createHash("sha512").update(value).digest("hex");
function credentials() {
  const key = process.env.PAYU_MERCHANT_KEY;
  const salt = process.env.PAYU_MERCHANT_SALT;
  if (!key || !salt) throw new Error("PayU credentials are not configured.");
  return { key, salt };
}
export function payuTransactionId(orderId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(orderId)) throw new Error("Invalid order ID.");
  return "tk" + orderId.replace(/-/g, "").slice(0, 23);
}
export function payuRequestHash(fields: {
  key: string; txnid: string; amount: string; productinfo: string; firstname: string; email: string;
}, salt: string) {
  return digest([fields.key, fields.txnid, fields.amount, fields.productinfo, fields.firstname, fields.email,
    "", "", "", "", "", "", "", "", "", "", salt].join("|"));
}
export function payuResponseHash(fields: Record<string, string>, salt: string) {
  const prefix = fields.additionalCharges ?? fields.additional_charges;
  const parts = [salt, fields.status, "", "", "", "", "", fields.udf5 ?? "", fields.udf4 ?? "",
    fields.udf3 ?? "", fields.udf2 ?? "", fields.udf1 ?? "", fields.email ?? "",
    fields.firstname ?? "", fields.productinfo ?? "", fields.amount ?? "", fields.txnid ?? "", fields.key ?? ""];
  if (prefix) parts.unshift(prefix);
  return digest(parts.join("|"));
}
export function payuVerifiedResponse(fields: Record<string, string>, key: string, salt: string) {
  const hash = fields.hash;
  if (!hash || !/^[a-f0-9]{128}$/i.test(hash) || fields.key !== key) return false;
  const expected = Buffer.from(payuResponseHash(fields, salt), "hex");
  const received = Buffer.from(hash, "hex");
  return received.length === expected.length && timingSafeEqual(expected, received);
}
export function payuPaymentForm(order: ProviderOrder, origin: string) {
  const { key, salt } = credentials();
  const txnid = payuTransactionId(order.id);
  const amount = (order.total_paise / 100).toFixed(2);
  const fields = {
    key, txnid, amount, productinfo: "Tikatero event tickets",
    firstname: order.buyer_name, email: order.buyer_email, phone: order.buyer_phone,
    surl: origin + "/api/payu/callback", furl: origin + "/api/payu/callback",
  };
  return {
    action: process.env.PAYU_ENV === "production" ? "https://secure.payu.in/_payment" : "https://test.payu.in/_payment",
    fields: { ...fields, hash: payuRequestHash(fields, salt) },
  };
}
function transactionDetails(json: unknown, txnid: string): Record<string, unknown> | null {
  if (!json || typeof json !== "object") return null;
  const data = json as Record<string, unknown>;
  const entries = data.transaction_details;
  if (!entries || typeof entries !== "object") return null;
  const item = (entries as Record<string, unknown>)[txnid];
  return item && typeof item === "object" ? item as Record<string, unknown> : null;
}
async function postservice(command: string, var1: string, more?: Record<string, string>) {
  const { key, salt } = credentials();
  const body = new URLSearchParams({
    key, command, var1, hash: digest([key, command, var1, salt].join("|")), ...more,
  });
  const url = process.env.PAYU_ENV === "production"
    ? "https://info.payu.in/merchant/postservice.php?form=2"
    : "https://test.payu.in/merchant/postservice.php?form=2";
  const response = await fetch(url, { method: "POST", body,
    cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Payment verification unavailable.");
  return response.json() as Promise<unknown>;
}
export class PayU implements PaymentGateway {
  readonly name = "payu" as const;
  readonly mode = this.name;
  verifyWebhook(raw: string) {
    try {
      return payuVerifiedResponse(Object.fromEntries(new URLSearchParams(raw)), credentials().key, credentials().salt);
    } catch { return false; }
  }
  async createOrder(order: ProviderOrder) {
    return { sessionId: payuTransactionId(order.id) };
  }
  async fetchOrderStatus(order: ProviderOrder): Promise<PaymentResult> {
    const result = await postservice("verify_payment", payuTransactionId(order.id));
    const item = transactionDetails(result, payuTransactionId(order.id));
    if (!item) return { state: "pending", amount: order.total_paise, currency: "INR" };
    if (String(item.status).toLowerCase() === "not found")
      return { state: "pending", amount: order.total_paise, currency: "INR" };
    if (String(item.txnid ?? "") !== payuTransactionId(order.id)) throw new Error("PayU order identity mismatch.");
    const amount = providerPaise(item.amt ?? item.amount);
    const state = String(item.status ?? "").toLowerCase();
    const captured = String(item.unmappedstatus ?? "").toLowerCase() === "captured";
    if (state === "success" && captured && !/^[0-9]+$/.test(String(item.mihpayid ?? "")))
      throw new Error("PayU payment identity is missing.");
    return {
      state: state === "success" && captured ? "paid" : state === "failure" || state === "failed" ? "failed" : "pending",
      amount, currency: "INR",
      paymentId: item.mihpayid ? String(item.mihpayid) : undefined,
    };
  }
  async refundStatus(requestId: string, expected: { paymentId: string; amountPaise: number; token: string }) {
    if (!/^[0-9]+$/.test(requestId)) throw new Error("Invalid PayU refund request ID.");
    const result = await postservice("check_action_status_txnid", requestId) as Record<string, unknown>;
    if (String(result.status) !== "1") return "pending" as const;
    const outer = result.transaction_details as Record<string, Record<string, unknown>> | undefined;
    const inner = outer?.[requestId]?.[requestId] as Record<string, unknown> | undefined;
    if (!inner || inner.action !== "refund") return "pending" as const;
    if (String(inner.mihpayid) !== expected.paymentId ||
        String(inner.token) !== expected.token ||
        providerPaise(inner.amt) !== expected.amountPaise)
      throw new Error("PayU refund details do not match.");
    const state = String(inner.status).toLowerCase();
    return state === "success" ? "processed" as const : state === "failure" ? "failed" as const : "pending" as const;
  }
  async refund(input: ProviderRefund): Promise<ProviderRefundResult> {
    if (!input.orderId || !/^[0-9]+$/.test(input.orderId)) throw new Error("PayU payment ID unavailable for refund.");
    if (input.vendorId || input.reversalPaise !== 0) throw new Error("PayU split refunds are not enabled.");
    const token = input.refundId.replace(/-/g, "").slice(0, 23);
    const result = await postservice("cancel_refund_transaction", input.orderId, {
      var2: token, var3: (input.amountPaise / 100).toFixed(2),
    }) as Record<string, unknown>;
    const accepted = String(result.status) === "1" || String(result.error_code) === "102";
    if (!accepted) throw new Error("PayU refund request was rejected.");
    const requestId = result.request_id;
    if (requestId == null || !/^[0-9]+$/.test(String(requestId))) throw new Error("PayU did not return a refund request ID.");
    return {
      cfRefundId: String(requestId),
      status: "pending",
    };
  }
}
