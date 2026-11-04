import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
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
    .select("*")
    .eq("id", id)
    .eq("buyer_id", user.id)
    .maybeSingle();
  if (error) throw new Error("Your order could not be loaded.");
  return data;
}
export async function verifyTurnstile(token: string, hostname: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.info("Checkout: Turnstile skipped; secret is not configured.");
    return;
  }
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret, response: token }),
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  const result = await response.json();
  if (
    !response.ok ||
    result.success !== true ||
    result.hostname !== hostname ||
    result.action !== "checkout"
  )
    throw new Error("Please complete the security check and try again.");
}
