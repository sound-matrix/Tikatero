import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  try {
    const client = await createClient();
    const code = params.get("code");
    const tokenHash = params.get("token_hash");
    // Only sign-in confirmation tokens are accepted; never trust a supplied next URL.
    const result = code
      ? await client.auth.exchangeCodeForSession(code)
      : tokenHash && params.get("type") === "email"
        ? await client.auth.verifyOtp({ token_hash: tokenHash, type: "email" })
        : null;
    if (result && !result.error) return response("/auth/complete", request);
  } catch {
    /* Provider failures use the same plain-English error. */
  }
  return response("/login?error=link", request);
}

function response(path: string, request: NextRequest) {
  const result = NextResponse.redirect(new URL(path, request.url), 303);
  result.headers.set("Cache-Control", "private, no-store");
  result.headers.set("Referrer-Policy", "no-referrer");
  return result;
}
