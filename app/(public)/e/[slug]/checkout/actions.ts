"use server";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { checkoutSchema, type CheckoutResult, type CheckoutOrder } from "@/lib/checkout/model";
import { checkoutData, providerOrder, transition } from "@/lib/checkout/store";
import { grantOrderAccess, tokenHash, verifyTurnstile } from "@/lib/checkout/security";
import { computePricing } from "@/lib/pricing/compute";
import { paymentProvider } from "@/lib/payments";
function providerMinimum(mode: string, amount: number) {
  return mode === "cashfree" && amount > 0 && amount < 100;
}
export async function submitCheckout(input: unknown): Promise<CheckoutResult> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Check your booking details." };
  const values = parsed.data;
  try {
    const client = createServiceClient();
    const requestHeaders = await headers();
    // Deployment supplies the canonical origin; never trust a client-provided return URL.
    const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").origin;
    const ip =
      requestHeaders.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
      requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    for (const key of [`ip:${ip}`, `email:${values.email}`]) {
      const { data, error } = await client.rpc("checkout_rate_limit", { p_key: tokenHash(key) });
      if (error || !data)
        return { error: "Too many booking attempts. Please wait 10 minutes and try again." };
    }
    await verifyTurnstile(values.turnstile, new URL(origin).hostname);
    const data = await checkoutData(values.slug);
    if (!data) return { error: "This event is not accepting bookings." };
    if (data.disabled) return { error: data.disabled };
    const lines = values.lines.map((line) => {
      const tier = data.tiers.find((t) => t.id === line.id);
      if (!tier) throw new Error("Choose a valid ticket tier.");
      return { ...line, price_paise: tier.price_paise };
    });
    const amounts = computePricing({
      lines,
      version: data.version,
      fee_payer: data.event.fee_payer,
      is_free: data.event.is_free,
    });
    if (
      values.pricingVersionId !== data.version.id ||
      values.quotedTotal !== amounts.total.buyer_total
    )
      return { error: "Prices changed. Please refresh checkout and review the total." };
    if (providerMinimum(data.mode, amounts.total.buyer_total))
      return { error: "Cashfree payments must be at least ₹ 1." };
    if (amounts.total.buyer_total > 0 && amounts.total.organiser_share <= 0)
      return { error: "This ticket cannot be booked at its current price." };
    const { data: existing, error: lookupError } = await client.rpc("checkout_user_by_email", {
      p_email: values.email,
    });
    if (lookupError) throw new Error("Buyer profile unavailable.");
    let buyerId: string | null = existing;
    if (!buyerId) {
      // Unverified Auth record only: claiming an email never signs the buyer in or
      // confirms that email. Existing names/phones are never overwritten.
      const created = await client.auth.admin.createUser({
        email: values.email,
        email_confirm: false,
        user_metadata: { full_name: values.name },
      });
      buyerId =
        created.data.user?.id ??
        (await client.rpc("checkout_user_by_email", { p_email: values.email })).data;
      if (!buyerId) throw new Error("Buyer profile unavailable.");
    }
    const id = randomUUID();
    const provider = paymentProvider();
    const free = amounts.total.buyer_total === 0;
    const hash = await grantOrderAccess(id);
    const { data: held, error } = await client.rpc("checkout_hold", {
      p_order_id: id,
      p_buyer_id: buyerId,
      p_slug: values.slug,
      p_name: values.name,
      p_email: values.email,
      p_phone: values.phone,
      p_lines: lines,
      p_pricing_version_id: data.version.id,
      p_fee_payer: data.event.fee_payer,
      p_is_free: data.event.is_free,
      p_amounts: amounts.total,
      p_provider: free ? "free" : provider.mode,
      p_token_hash: hash,
      p_attendees: values.attendees,
      p_is_test: !free && (provider.mode === "mock" || process.env.CASHFREE_ENV !== "production"),
    });
    if (error || !held)
      return {
        error:
          error?.code === "P0001" ? error.message : "Booking could not be held. Please try again.",
      };
    const order = held as unknown as CheckoutOrder;
    if (free) {
      await transition(order, { state: "paid", amount: 0, currency: "INR" });
      return { url: `/orders/${id}/status` };
    }
    // If the request times out, keep the hold and reconcile; the remote create may
    // have succeeded. Never release inventory based on an ambiguous network error.
    try {
      const { sessionId } = await provider.create(providerOrder(order), origin);
      const saved = await client
        .from("orders")
        .update({ payment_session_id: sessionId })
        .eq("id", id)
        .eq("status", "pending");
      if (saved.error) throw new Error("Payment session unavailable.");
      return {
        url: `/orders/${id}/pay`,
        ...(provider.mode === "cashfree"
          ? {
              payment: {
                sessionId,
                mode:
                  process.env.CASHFREE_ENV === "production"
                    ? ("production" as const)
                    : ("sandbox" as const),
              },
            }
          : {}),
      };
    } catch {
      return { url: `/orders/${id}/status` };
    }
  } catch {
    return { error: "Checkout is temporarily unavailable. Please try again." };
  }
}
