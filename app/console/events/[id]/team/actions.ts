"use server";

import { revalidatePath } from "next/cache";
import { requireAccount } from "@/lib/auth/account";
import { canManageTeam } from "@/lib/scan/access";
import { EVENT_ID } from "@/lib/scan/codes";
import { createInvite, removeMember, revokeDevice } from "@/lib/scan/team";

async function manager(eventId: string) {
  if (!EVENT_ID.test(eventId)) return null;
  const { client, account } = await requireAccount();
  const { data } = await client
    .from("events")
    .select("id, organiser_id")
    .eq("id", eventId)
    .maybeSingle();
  if (!data || !canManageTeam(account, { id: data.id, organiserId: data.organiser_id }))
    return null;
  return account;
}

export async function inviteTeamMember(input: { eventId: string; email: string; role: string }) {
  const account = await manager(input.eventId);
  if (!account) return { error: "You can't invite people to this event." };
  const result = await createInvite({
    eventId: input.eventId,
    email: input.email,
    role: input.role,
    actorId: account.profile.id,
    inviterName: account.profile.full_name?.trim() || "Your organiser",
  });
  if (!result.error) revalidatePath(`/console/events/${input.eventId}/team`);
  return result;
}

export async function removeTeamMember(eventId: string, memberId: string) {
  const account = await manager(eventId);
  if (!account) return { error: "You can't change the team for this event." };
  const result = await removeMember(memberId, account.profile.id);
  if (!result.error) revalidatePath(`/console/events/${eventId}/team`);
  return result;
}

export async function revokeTeamDevice(eventId: string, deviceId: string) {
  const account = await manager(eventId);
  if (!account) return { error: "You can't change phones for this event." };
  const result = await revokeDevice(deviceId, account.profile.id);
  if (!result.error) revalidatePath(`/console/events/${eventId}/team`);
  return result;
}
