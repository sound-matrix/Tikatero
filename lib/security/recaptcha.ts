import "server-only";
import { RECAPTCHA_MAX_TOKEN_LENGTH } from "./recaptcha-token";

export const RECAPTCHA_MIN_SCORE = 0.5;
export { RECAPTCHA_RETRY } from "./recaptcha-token";
export type RecaptchaAction = "checkout" | "contact";

export function recaptchaSiteKey() {
  const site = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim() ?? "";
  return site && process.env.RECAPTCHA_SECRET_KEY?.trim() ? site : "";
}

function minimumScore() {
  const value = process.env.RECAPTCHA_MIN_SCORE?.trim();
  const score = value ? Number(value) : RECAPTCHA_MIN_SCORE;
  return Number.isFinite(score) && score >= 0 && score <= 1 ? score : RECAPTCHA_MIN_SCORE;
}

function allowedHostname(hostname: unknown) {
  if (typeof hostname !== "string") return false;
  return (
    hostname === "tikatero.com" ||
    hostname === "www.tikatero.com" ||
    (process.env.VERCEL_ENV !== "production" &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/i.test(hostname))
  );
}

/** Verify fresh, single-use tokens; never log tokens, keys or provider responses. */
export async function verifyRecaptcha(token: string, action: RecaptchaAction) {
  if (!recaptchaSiteKey() || !token || token.length > RECAPTCHA_MAX_TOKEN_LENGTH) return false;
  try {
    const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      body: new URLSearchParams({
        secret: process.env.RECAPTCHA_SECRET_KEY!.trim(),
        response: token,
      }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!response.ok) return false;
    const result: unknown = await response.json();
    if (!result || typeof result !== "object") return false;
    const check = result as Record<string, unknown>;
    return (
      check.success === true &&
      check.action === action &&
      allowedHostname(check.hostname) &&
      typeof check.score === "number" &&
      Number.isFinite(check.score) &&
      check.score >= minimumScore() &&
      check.score <= 1
    );
  } catch {
    return false;
  }
}
