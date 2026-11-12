import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PAYMENTS_UNAVAILABLE, productionPaymentLock } from "@/lib/payments/model";
import { recaptchaSiteKey, verifyRecaptcha, RECAPTCHA_RETRY } from "@/lib/security/recaptcha";
import type { CheckoutOrder } from "./model";
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
function orderCookie(path: string) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https:"),
    path,
    maxAge: 60 * 60 * 24 * 30,
  };
}

export async function grantOrderAccess(id: string) {
  const token = randomBytes(32).toString("base64url");
  const jar = await cookies();
  jar.set(`checkout_${id}`, token, orderCookie(`/orders/${id}`));
  jar.set(`ticket_${id}`, token, orderCookie("/t"));
  return tokenHash(token);
}
/** Order IDs alone never grant access. Guest access is scoped to the order cookie. */
export async function ownOrder(id: string): Promise<CheckoutOrder | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const token = (await cookies()).get(`checkout_${id}`)?.value;
  if (token && token.length === 43) {
    const { data, error } = await createServiceClient()
      .from("orders")
      .select("*")
      .eq("id", id)
      .eq("access_token_hash", tokenHash(token))
      .maybeSingle();
    if (error) throw new Error("Your order could not be loaded.");
    if (data) return data;
  }
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user || !user.email_confirmed_at) return null;
  // Even staff/organiser RLS access is not buyer authority for checkout mutations.
  const { data, error } = await client
    .from("orders")
    .select(
      "id, event_id, buyer_id, buyer_name, buyer_email, buyer_phone, subtotal_paise, total_paise, fee_payer, status, cf_order_id, cf_payment_id, pricing_version_id, created_at, paid_at, payment_provider, payment_session_id, access_token_hash, hold_expires_at, attendee_names, consent_at, is_test, reconciled_at, emailed_at, ref_channel",
    )
    .eq("id", id)
    .eq("buyer_id", user.id)
    .maybeSingle();
  if (error) throw new Error("Your order could not be loaded.");
  if (!data) return null;
  // Fee columns are not granted to the buyer session. Checkout only needs the total.
  return {
    ...data,
    vendor_id: null,
    payout_mode: "manual",
    organiser_share_paise: 0,
    platform_share_paise: 0,
    platform_fee_paise: 0,
    platform_fee_gst_paise: 0,
    gateway_fee_paise: 0,
    absorbed_gateway_paise: null,
  };
}
/**
 * Live production checkout must verify reCAPTCHA. Preview, local development,
 * and the explicit production mock switch may skip only when the secret is absent.
 */
export function recaptchaRequired(
  env: {
    NODE_ENV?: string;
    VERCEL_ENV?: string;
    PAYMENTS_ALLOW_MOCK?: string;
    CASHFREE_ENV?: string;
  } = process.env,
) {
  if (!productionPaymentLock(env)) return false;
  return !(env.PAYMENTS_ALLOW_MOCK === "true" && env.CASHFREE_ENV === "mock");
}

/** Preserve free/mock operation when keys are absent; live production fails closed. */
export async function verifyCheckoutRecaptcha(token: string, options: { livePayment: boolean }) {
  if (!recaptchaSiteKey()) {
    if (options.livePayment && recaptchaRequired()) throw new Error(PAYMENTS_UNAVAILABLE);
    return;
  }
  if (!(await verifyRecaptcha(token, "checkout"))) throw new Error(RECAPTCHA_RETRY);
}
