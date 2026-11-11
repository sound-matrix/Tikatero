import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/** Fail closed. Keys are hashes, never raw emails, tokens, or addresses. */
export async function allowRequest(
  scope: string,
  id: string,
  limit: number,
  windowSeconds: number,
) {
  const key = digest(`${scope}\n${id}`).slice(0, 64);
  try {
    const { data, error } = await createServiceClient().rpc("consume_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function requestIp() {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export function requestIpFrom(request: Request) {
  return (
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
