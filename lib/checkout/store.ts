import "server-only";
import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/service";
import { activePricing } from "@/lib/pricing/data";
import { paymentProvider } from "@/lib/payments";
import type { CheckoutOrder } from "./model";
import type { Json } from "@/lib/db/types";
import type { PaymentResult, ProviderOrder } from "@/lib/payments/model";
export const checkoutData = cache(async (slug: string) => {
  const client = createServiceClient();
  const { data: event, error } = await client
    .from("events")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error("Checkout is temporarily unavailable.");
  if (!event) return null;
  const [{ data: organiser, error: oe }, { data: tiers, error: te }, version] = await Promise.all([
    client
      .from("organisers")
      .select("id, kyc_status, sales_paused, cashfree_vendor_id")
      .eq("id", event.organiser_id)
      .single(),
    client.from("ticket_types").select("*").eq("event_id", event.id).order("sort"),
    activePricing(),
  ]);
  if (oe || te || !organiser) throw new Error("Checkout is temporarily unavailable.");
  const mode = paymentProvider().mode;
  let disabled = "";
  if (organiser.kyc_status !== "approved")
    disabled = "This organiser is awaiting approval. Please come back soon.";
  else if (organiser.sales_paused)
    disabled = "Ticket sales are temporarily paused. Please come back soon.";
  else if (!event.is_free && mode === "cashfree" && !organiser.cashfree_vendor_id?.trim())
    disabled = "This organiser is not ready to accept payments. Please come back soon.";
  else if (Date.parse(event.ends_at ?? event.starts_at ?? "") <= Date.now())
    disabled = "This event has ended.";
  return { event, tiers: tiers ?? [], version, disabled, mode };
});

export function providerOrder(order: CheckoutOrder): ProviderOrder {
  if (!order.hold_expires_at || !order.buyer_phone)
    throw new Error("This order has no payment session.");
  return { ...order, hold_expires_at: order.hold_expires_at, buyer_phone: order.buyer_phone };
}
export async function transition(
  order: CheckoutOrder,
  result: PaymentResult,
  event?: { id: string; payload: Json },
) {
  const { data, error } = await createServiceClient().rpc("checkout_transition", {
    p_order_id: order.id,
    p_state: result.state,
    p_amount: result.amount,
    p_currency: result.currency,
    ...(result.paymentId ? { p_payment_id: result.paymentId } : {}),
    ...(event ? { p_source: "cashfree", p_event_id: event.id, p_payload: event.payload } : {}),
  });
  if (error) throw new Error("Payment status could not be saved.");
  return data;
}
export async function reconcile(order: CheckoutOrder) {
  if (!["created", "pending"].includes(order.status)) return order.status;
  const stale = Date.parse(order.hold_expires_at ?? "") <= Date.now();
  if (order.payment_provider === "cashfree") {
    // A provider timeout keeps the order pending for the next reconciliation.
    const provider = paymentProvider();
    if (provider.mode !== "cashfree")
      throw new Error("The order's payment provider is not available.");
    const result = await provider.get(providerOrder(order));
    // Get Order ACTIVE is not final, even after local expiry: a payment may still
    // settle. Holds expire by timestamp; late successes recheck capacity in SQL.
    return transition(
      order,
      result.state === "pending" && stale ? { ...result, state: "expired" } : result,
    );
  }
  if (stale)
    return transition(order, { state: "expired", amount: order.total_paise, currency: "INR" });
  return order.status;
}
