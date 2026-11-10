import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readAccount } from "@/lib/auth/account";
import { landingPath } from "@/lib/auth/routing";
import { INVITE_TOKEN } from "@/lib/scan/codes";

export async function GET() {
  const jar = await cookies();
  const invite = jar.get("tikatero_team_invite")?.value;
  const account = await readAccount(await createClient());
  const resume = account && invite && INVITE_TOKEN.test(invite);
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: resume ? `/team/accept?token=${invite}` : account ? landingPath(account) : "/login",
    },
  });
  response.headers.set("Cache-Control", "private, no-store");
  if (resume) response.cookies.set("tikatero_team_invite", "", { path: "/", maxAge: 0 });
  return response;
}
