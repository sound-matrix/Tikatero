"use server";

import { createClient } from "@/lib/supabase/server";
import { allowRequest, requestIp } from "@/lib/security/rate-limit";
import { cookies } from "next/headers";
import { returnPath } from "@/lib/auth/return-path";
import { signupIntent } from "@/lib/auth/signup-intent";

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

export async function requestSignInCode(
  emailInput: string,
  intentInput?: string,
  next?: string | null,
) {
  const email = emailOf(emailInput);
  if (!email) return { error: "Enter the email address for your account." };
  const parsed = signupIntent.safeParse(intentInput ?? "attendee");
  if (!parsed.success) return { error: "Choose how you want to use Tikatero." };
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
      options: {
        emailRedirectTo: `${siteOrigin()}/auth/callback`,
        data: { signup_intent: parsed.data },
      },
    });
    if (error)
      return { error: "We could not send your email. Please wait a minute and try again." };
    const jar = await cookies();
    const destination = returnPath(next);
    jar.set("tikatero_auth_return", destination ?? "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/auth",
      maxAge: destination ? 1800 : 0,
      secure: siteOrigin().startsWith("https:"),
    });
    jar.set("tikatero_signup_email", "", { path: "/login", maxAge: 0 });
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

function validPassword(password: string) {
  return password.length >= 8 && password.length <= 128;
}

/** Returning members sign in with a password; never reveal whether an email exists. */
export async function signInWithPassword(emailInput: string, password: string, next?: string | null) {
  const email = emailOf(emailInput);
  if (!email || !password) return { error: "Enter your email and password." };
  const ip = await requestIp();
  const [byIp, byEmail] = await Promise.all([
    allowRequest("password-login-ip", ip, 20, 600),
    allowRequest("password-login-email", email, 8, 600),
  ]);
  if (!byIp || !byEmail) return { error: LIMITED };
  try {
    const client = await createClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { error: "Email or password is incorrect. If you previously signed in by email code, choose Set up password." };
    const destination = returnPath(next);
    (await cookies()).set("tikatero_auth_return", destination ?? "", {
      httpOnly: true, sameSite: "lax", path: "/auth",
      maxAge: destination ? 1800 : 0, secure: siteOrigin().startsWith("https:"),
    });
    return { ok: true as const };
  } catch { return { error: UNAVAILABLE }; }
}

/** Requires the OTP-established Supabase user session (not a self-reported email). */
export async function setVerifiedPassword(password: string) {
  if (!validPassword(password)) return { error: "Use a password between 8 and 128 characters." };
  try {
    const client = await createClient();
    const { data, error: authError } = await client.auth.getUser();
    if (authError || !data.user?.email) return { error: "Verify your email code before setting a password." };
    const { error } = await client.auth.updateUser({ password });
    if (error) return { error: "Could not set your password. Try again." };
    return { ok: true as const };
  } catch { return { error: UNAVAILABLE }; }
}
