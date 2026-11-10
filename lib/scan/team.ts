import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { send } from "@/lib/email/send";
import { createServiceClient } from "@/lib/supabase/service";
import { EVENT_ID, INVITE_TOKEN } from "./codes";
import { plainDatabaseError } from "./errors";

const ROLE = { door: "Door scanner", manager: "Event manager" } as const;
export type TeamRole = keyof typeof ROLE;

export function inviteToken() {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function roleOf(value: string): TeamRole | null {
  return value === "door" || value === "manager" ? value : null;
}

type Outcome = { error?: string; message?: string; link?: string };

export async function createInvite(input: {
  eventId: string;
  email: string;
  role: string;
  actorId: string;
  inviterName: string;
}): Promise<Outcome> {
  const role = roleOf(input.role);
  if (!EVENT_ID.test(input.eventId) || !role) return { error: "Choose a team role." };
  const client = createServiceClient();
  const { data: event, error: eventError } = await client
    .from("events")
    .select("id, organiser_id, title")
    .eq("id", input.eventId)
    .maybeSingle();
  if (eventError || !event) return { error: "The invitation could not be sent. Try again." };
  const { data: organiser, error: organiserError } = await client
    .from("organisers")
    .select("display_name")
    .eq("id", event.organiser_id)
    .maybeSingle();
  if (organiserError || !organiser)
    return { error: "The invitation could not be sent. Try again." };

  const { token, hash } = inviteToken();
  const { data: inviteId, error } = await client.rpc("create_team_invite", {
    p_event_id: input.eventId,
    p_email: input.email,
    p_role: role,
    p_actor: input.actorId,
    p_token_hash: hash,
  });
  if (error || !inviteId)
    return { error: plainDatabaseError(error, "The invitation could not be sent. Try again.") };

  const path = `/team/accept?token=${token}`;
  const sent = await send({
    template: "team_invite",
    to: input.email.trim(),
    entityRef: `team/${inviteId}`,
    data: {
      organiserName: organiser.display_name,
      inviterName: input.inviterName.trim() || "Your organiser",
      role: ROLE[role],
      actionPath: path,
    },
  });
  const emailed =
    sent.status === "sent" || sent.status === "sent_unlogged" || sent.status === "duplicate";
  return emailed
    ? { message: "Invitation sent." }
    : {
        message:
          "We couldn't email this invitation. Share the link. It works once and expires in 72 hours.",
        link: path,
      };
}

export function parseAccept(value: string) {
  const [status, eventId, role] = value.split("|");
  if (
    (status === "accepted" || status === "already") &&
    eventId &&
    EVENT_ID.test(eventId) &&
    (role === "door" || role === "manager")
  )
    return { status, eventId, role };
  return { status: status || "invalid" };
}

export function acceptMessage(status: string) {
  if (status === "used") return "This invitation has already been used.";
  if (status === "expired") return "This invitation has expired. Ask the organiser for a new one.";
  if (status === "email") return "Sign in with the email address that received the invitation.";
  if (status === "blocked") return "This account can't join a team.";
  return "This invitation link isn't valid.";
}

export async function previewInvite(token: string, email: string | null) {
  if (!INVITE_TOKEN.test(token)) return { error: acceptMessage("invalid") };
  const { data, error } = await createServiceClient()
    .from("team_invites")
    .select("event_id, email, role, expires_at, accepted_at, revoked_at")
    .eq("token_hash", hashInviteToken(token))
    .maybeSingle();
  if (error || !data || data.revoked_at) return { error: acceptMessage("invalid") };
  const sameEmail = Boolean(email && email.toLowerCase() === data.email);
  if (data.accepted_at) {
    if (sameEmail) return { already: true as const, eventId: data.event_id, role: data.role };
    return { error: acceptMessage("used") };
  }
  if (Date.parse(data.expires_at) <= Date.now()) return { error: acceptMessage("expired") };
  if (!sameEmail) return { error: acceptMessage("email") };
  const { data: event } = await createServiceClient()
    .from("events")
    .select("title")
    .eq("id", data.event_id)
    .maybeSingle();
  return {
    title: event?.title ?? "this event",
    role: data.role,
    eventId: data.event_id,
  };
}

export async function acceptInvite(token: string, userId: string) {
  if (!INVITE_TOKEN.test(token)) return { error: acceptMessage("invalid") };
  const { data, error } = await createServiceClient().rpc("accept_team_invite", {
    p_token_hash: hashInviteToken(token),
    p_user_id: userId,
  });
  if (error || !data) return { error: "The invitation could not be accepted. Try again." };
  const parsed = parseAccept(data);
  if (parsed.status === "accepted" || parsed.status === "already")
    return { eventId: parsed.eventId, role: parsed.role };
  return { error: acceptMessage(parsed.status) };
}

export async function removeMember(memberId: string, actorId: string): Promise<Outcome> {
  if (!EVENT_ID.test(memberId) && !/^[0-9a-f-]{36}$/i.test(memberId))
    return { error: "That team member was not found." };
  const { error } = await createServiceClient().rpc("remove_event_team_member", {
    p_member: memberId,
    p_actor: actorId,
  });
  if (error)
    return { error: plainDatabaseError(error, "That person could not be removed. Try again.") };
  return { message: "Removed from the team." };
}

export async function revokeDevice(deviceRowId: string, actorId: string): Promise<Outcome> {
  if (!/^[0-9a-f-]{36}$/i.test(deviceRowId)) return { error: "That device was not found." };
  const { error } = await createServiceClient().rpc("revoke_scan_device", {
    p_device: deviceRowId,
    p_actor: actorId,
  });
  if (error)
    return { error: plainDatabaseError(error, "That phone could not be removed. Try again.") };
  return { message: "That phone can no longer scan offline." };
}
