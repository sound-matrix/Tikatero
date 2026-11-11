"use server";

import { createClient } from "@/lib/supabase/server";
import { allowRequest, requestIp } from "@/lib/security/rate-limit";

const LIMITED = "Too many sign-in attempts. Please wait 10 minutes and try again.";
const UNAVAILABLE = "Sign-in is temporarily unavailable. Please try again.";

function emailOf(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(email) || email.length > 254) return null;
  return email;
}

function siteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      return "http://127.0.0.1:3000";
    }
  }
  return "http://127.0.0.1:3000";
}

export async function requestSignInCode(emailInput: string) {
  const email = emailOf(emailInput);
  if (!email) return { error: "Enter the email address for your account." };
  const ip = await requestIp();
  const [byIp, byEmail] = await Promise.all([
    allowRequest("login-send-ip", ip, 30, 600),
    allowRequest("login-send-email", email, 5, 600),
  ]);
  if (!byIp || !byEmail) return { error: LIMITED };
  try {
    const client = await createClient();
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${siteOrigin()}/auth/callback` },
    });
    if (error)
      return { error: "We could not send your email. Please wait a minute and try again." };
    return { sent: true as const };
  } catch {
    return { error: UNAVAILABLE };
  }
}

export async function verifySignInCode(emailInput: string, token: string) {
  const email = emailOf(emailInput);
  if (!email || !/^\d{6}$/.test(token)) return { error: "Enter the 6-digit code from your email." };
  const ip = await requestIp();
  const [byIp, byEmail] = await Promise.all([
    allowRequest("login-verify-ip", ip, 40, 600),
    allowRequest("login-verify-email", email, 8, 600),
  ]);
  if (!byIp || !byEmail) return { error: LIMITED };
  try {
    const client = await createClient();
    const { error } = await client.auth.verifyOtp({ email, token, type: "email" });
    if (error)
      return { error: "That code is incorrect or has expired. Try again or request a new email." };
    return { ok: true as const };
  } catch {
    return { error: UNAVAILABLE };
  }
}
