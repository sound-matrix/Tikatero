import { NextResponse, type NextRequest } from "next/server";
import { withReturnPath } from "@/lib/auth/return-path";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  try {
    const client = await createClient();
    const code = params.get("code");
    const tokenHash = params.get("token_hash");
    // Only sign-in confirmation tokens are accepted.
    const result = code
      ? await client.auth.exchangeCodeForSession(code)
      : tokenHash && params.get("type") === "email"
        ? await client.auth.verifyOtp({ token_hash: tokenHash, type: "email" })
        : null;
    if (result && !result.error)
      return response(withReturnPath("/auth/complete", params.get("next")));
  } catch {
    /* Provider failures use the same plain-English error. */
  }
  return response(withReturnPath("/login?error=link", params.get("next")));
}

function response(path: string) {
  // Relative Location preserves the public host, including behind a reverse
  // proxy whose internal request URL may use a different origin.
  const result = new NextResponse(null, { status: 303, headers: { Location: path } });
  result.headers.set("Cache-Control", "private, no-store");
  result.headers.set("Referrer-Policy", "no-referrer");
  return result;
}
