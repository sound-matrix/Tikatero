import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { requireAccount } from "@/lib/auth/account";
import { canManageTeam } from "@/lib/scan/access";
import { EVENT_ID } from "@/lib/scan/codes";
import { createServiceClient } from "@/lib/supabase/service";
import { TeamPanel, type DeviceRow, type TeamRow } from "./team-panel";

export const metadata: Metadata = { title: "Team" };

async function TeamScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!EVENT_ID.test(id)) notFound();
  const { client, account } = await requireAccount();
  const { data: event } = await client
    .from("events")
    .select("id, organiser_id, title")
    .eq("id", id)
    .maybeSingle();
  if (!event) notFound();
  const ref = { id: event.id, organiserId: event.organiser_id };
  if (!canManageTeam(account, ref)) redirect(`/console/events/${event.id}/scan`);

  const service = createServiceClient();
  const [{ data: team, error: teamError }, { data: devices, error: deviceError }] =
    await Promise.all([
      service
        .from("event_team")
        .select("id, email, role, user_id, created_at")
        .eq("event_id", event.id)
        .order("created_at"),
      service
        .from("scan_devices")
        .select("id, device_id, created_at, user_id")
        .eq("event_id", event.id)
        .is("revoked_at", null)
        .order("created_at"),
    ]);
  if (teamError || deviceError) throw new Error("The team could not be loaded. Try again.");

  const userIds = [
    ...new Set(
      [
        ...(team ?? []).map((member) => member.user_id),
        ...(devices ?? []).map((device) => device.user_id),
      ].filter((value): value is string => Boolean(value)),
    ),
  ];
  const { data: profiles } = userIds.length
    ? await service.from("profiles").select("id, full_name").in("id", userIds)
    : { data: [] };
  const names = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile.full_name?.trim() || ""]),
  );

  const members: TeamRow[] = (team ?? []).flatMap((member) => {
    if (member.role !== "manager" && member.role !== "door") return [];
    const email = member.email ?? "Invited teammate";
    return [
      {
        id: member.id,
        email,
        name: (member.user_id && names.get(member.user_id)) || email,
        role: member.role,
        status: member.user_id ? "Active" : "Invited",
      },
    ];
  });
  const deviceRows: DeviceRow[] = (devices ?? []).map((device, index) => ({
    id: device.id,
    label: `${(device.user_id && names.get(device.user_id)) || "Team phone"} · phone ${index + 1}`,
    added: device.created_at,
  }));

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 bg-white px-4 py-8">
      <header>
        <p className="mb-2 text-sm font-bold uppercase tracking-widest text-teal">Team</p>
        <h1 className="text-3xl font-extrabold text-ink">Team for {event.title}</h1>
        <p className="mt-2 text-muted">
          Invite people by email. Door staff can scan this event only. They cannot see payouts,
          orders, or ticket prices.
        </p>
      </header>
      <p>
        <Link
          className="font-semibold text-teal underline"
          href={`/console/events/${event.id}/scan`}
        >
          Open the scanner
        </Link>
      </p>
      <TeamPanel eventId={event.id} members={members} devices={deviceRows} />
    </main>
  );
}

export default function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="p-8">Loading the team…</p>}>
      <TeamScreen params={params} />
    </Suspense>
  );
}
