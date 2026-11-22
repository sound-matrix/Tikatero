import { createHmac, timingSafeEqual } from "node:crypto";
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function secret() {
  const value = process.env.PROMOTIONS_UNSUBSCRIBE_SECRET?.trim();
  return value && value.length >= 32 ? value : null;
}
export function promotionEmailConfigured() {
  return process.env.PROMOTIONS_EMAIL_ENABLED === "true" &&
    !!secret() && !!process.env.RESEND_API_KEY?.trim() &&
    !!process.env.EMAIL_FROM?.trim() && !!process.env.NEXT_PUBLIC_SITE_URL?.trim();
}
export function signUnsubscribe(userId: string) {
  const key = secret();
  if (!key || !idPattern.test(userId)) throw new Error("Unsubscribe is not configured.");
  const sig = createHmac("sha256", key).update(`tikatero-promo-v1:${userId}`).digest("hex");
  return `${userId}.${sig}`;
}
export function verifyUnsubscribe(input: string) {
  const key = secret();
  const match = idPattern.source.slice(1, -1);
  const pattern = new RegExp(`^(${match})\\.([a-f0-9]{64})$`);
  const parsed = pattern.exec(input);
  if (!key || !parsed) return null;
  const expected = createHmac("sha256", key)
    .update(`tikatero-promo-v1:${parsed[1]}`).digest();
  const received = Buffer.from(parsed[2], "hex");
  return expected.length === received.length && timingSafeEqual(expected, received)
    ? parsed[1] : null;
}
