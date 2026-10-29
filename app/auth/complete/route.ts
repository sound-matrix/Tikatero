import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readAccount } from "@/lib/auth/account";
import { landingPath } from "@/lib/auth/routing";

export async function GET(request: NextRequest) {
  const account = await readAccount(await createClient());
  const response = NextResponse.redirect(
    new URL(account ? landingPath(account) : "/login", request.url),
    303,
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
