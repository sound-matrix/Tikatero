import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readAccount } from "@/lib/auth/account";
import { landingPath } from "@/lib/auth/routing";

export async function GET() {
  const account = await readAccount(await createClient());
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: account ? landingPath(account) : "/login" },
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
