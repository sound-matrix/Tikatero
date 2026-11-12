import { cookies } from "next/headers";
import { after } from "next/server";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rememberGuestBooking } from "@/lib/account/checkout";
import { readAccount } from "@/lib/auth/account";
import { returnPath } from "@/lib/auth/return-path";
import { routeRedirect } from "@/lib/auth/routing";
import { INVITE_TOKEN } from "@/lib/scan/codes";
import { completeSignup, sendWelcomeOnce } from "@/lib/auth/complete-signup";

export async function GET(request?: NextRequest) {
  const jar = await cookies();
  const invite = jar.get("tikatero_team_invite")?.value;
  const client = await createClient();
  const account = await readAccount(client);
  const guestOrder = jar.get("tikatero_booked_order")?.value;
  if (account && guestOrder && !account.profile.blocked_at)
    await rememberGuestBooking(client, guestOrder, account.profile.id);
  const completion = account ? await completeSignup(client, account) : null;
  const resume = account && invite && INVITE_TOKEN.test(invite);
  const next = returnPath(
    request?.nextUrl.searchParams.get("next") ?? jar.get("tikatero_auth_return")?.value,
  );
  const destination =
    account && next && !routeRedirect(account, new URL(next, "https://tikatero.invalid").pathname)
      ? next
      : (completion?.path ?? "/login");
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: resume ? `/team/accept?token=${invite}` : destination,
    },
  });
  response.headers.set("Cache-Control", "private, no-store");
  if (jar.get("tikatero_auth_return"))
    response.cookies.set("tikatero_auth_return", "", { path: "/auth", maxAge: 0 });
  if (guestOrder) response.cookies.set("tikatero_booked_order", "", { path: "/auth", maxAge: 0 });
  if (resume) response.cookies.set("tikatero_team_invite", "", { path: "/", maxAge: 0 });
  if (completion?.welcome)
    after(() =>
      sendWelcomeOnce(completion.welcome!).catch(() =>
        console.error("Welcome email delivery could not start."),
      ),
    );
  return response;
}
