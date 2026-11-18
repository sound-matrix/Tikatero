import { acceptPayUNotification } from "@/lib/payments/payu-callback";
import { payuVerifiedResponse } from "@/lib/payments/payu";
import { allowRequest, requestIpFrom } from "@/lib/security/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";
export async function POST(request: Request) {
  // Audit each delivery, including invalid and rate-limited attempts, before acting on it.
  const tooLarge = Number(request.headers.get("content-length") ?? 0) > 16_384;
  let raw = "";
  try {
    if (!tooLarge) raw = await request.clone().text();
  } catch {
    // A malformed body is still an invalid delivery worth recording.
  }
  const fields = raw.length <= 16_384 ? Object.fromEntries(new URLSearchParams(raw)) : {};
  const key = process.env.PAYU_MERCHANT_KEY ?? "";
  const salt = process.env.PAYU_MERCHANT_SALT ?? "";
  const hashValid = !tooLarge && !!key && !!salt && payuVerifiedResponse(fields, key, salt);
  const txnid = fields.txnid && /^[a-zA-Z0-9]{8,25}$/.test(fields.txnid) ? fields.txnid : null;
  const status = fields.status && /^(success|failure|failed|pending)$/i.test(fields.status)
    ? fields.status.toLowerCase() : null;
  const { error } = await createServiceClient().from("webhook_events").insert({
    source: "payu",
    provider: "payu",
    event_id: crypto.randomUUID(),
    payload: {},
    txnid,
    status,
    received_at: new Date().toISOString(),
    hash_valid: hashValid,
  });
  if (error) return new Response(null, { status: 503 });
  if (tooLarge || raw.length > 16_384) return new Response(null, { status: 413 });
  if (!(await allowRequest("webhook", requestIpFrom(request), 120, 60)))
    return new Response(null, { status: 429 });
  const result = await acceptPayUNotification(request);
  return Response.json(
    { received: result.httpStatus === 200 },
    { status: result.httpStatus, headers: { "Cache-Control": "no-store" } },
  );
}
