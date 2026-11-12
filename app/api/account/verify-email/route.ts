import { NextResponse } from "next/server";
import { tokenHash } from "@/lib/checkout/security";
import { allowRequest, requestIpFrom } from "@/lib/security/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  let verified = false;
  if (
    /^[\w-]{43}$/.test(token) &&
    (await allowRequest("backup-email-verify", requestIpFrom(request), 30, 600))
  ) {
    const { data } = await createServiceClient().rpc("verify_backup_email", {
      p_hash: tokenHash(token),
    });
    verified = data === true;
  }
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: `/me/profile?email=${verified ? "verified" : "expired"}`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
