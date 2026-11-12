import { cookies } from "next/headers";
import { after } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readAccount } from "@/lib/auth/account";
import { INVITE_TOKEN } from "@/lib/scan/codes";
import { completeSignup, sendWelcomeOnce } from "@/lib/auth/complete-signup";

export async function GET() {
  const jar = await cookies();
  const invite = jar.get("tikatero_team_invite")?.value;
  const client = await createClient();
  const account = await readAccount(client);
  const completion = account ? await completeSignup(client, account) : null;
  const resume = account && invite && INVITE_TOKEN.test(invite);
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: resume ? `/team/accept?token=${invite}` : (completion?.path ?? "/login"),
    },
  });
  response.headers.set("Cache-Control", "private, no-store");
  if (resume) response.cookies.set("tikatero_team_invite", "", { path: "/", maxAge: 0 });
  if (completion?.welcome)
    after(() =>
      sendWelcomeOnce(completion.welcome!).catch(() =>
        console.error("Welcome email delivery could not start."),
      ),
    );
  return response;
}
