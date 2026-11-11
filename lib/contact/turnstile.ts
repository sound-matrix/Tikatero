import "server-only";

import { connection } from "next/server";

/** Contact uses Turnstile only when both keys exist. Checkout stays fail-closed. */
export async function contactTurnstileSiteKey() {
  await connection();
  const site = process.env.TURNSTILE_SITE_KEY?.trim() ?? "";
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim() ?? "";
  if (!site || !secret) return "";
  return site;
}

export async function verifyContactTurnstile(token: string) {
  const site = process.env.TURNSTILE_SITE_KEY?.trim() ?? "";
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim() ?? "";
  if (!site || !secret) return true;
  if (!token || token.length > 2048) return false;
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    const result = (await response.json()) as { success?: boolean; action?: string };
    return response.ok && result.success === true && result.action === "contact";
  } catch {
    return false;
  }
}
