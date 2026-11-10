"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireAccount } from "@/lib/auth/account";
import { INVITE_TOKEN } from "@/lib/scan/codes";
import { acceptInvite } from "@/lib/scan/team";

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function rememberInvite(token: string) {
  if (!INVITE_TOKEN.test(token)) return;
  const jar = await cookies();
  jar.set("tikatero_team_invite", token, cookieOptions(60 * 60));
  redirect("/login");
}

export async function acceptInvitation(token: string) {
  const { account } = await requireAccount();
  const result = await acceptInvite(token, account.profile.id);
  const jar = await cookies();
  jar.set("tikatero_team_invite", "", cookieOptions(0));
  if (result.error || !result.eventId)
    return { error: result.error ?? "This invitation link isn't valid." };
  const path =
    result.role === "manager"
      ? `/console/events/${result.eventId}/team`
      : `/console/events/${result.eventId}/scan`;
  return { path };
}
