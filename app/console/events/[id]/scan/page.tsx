import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { requireAccount } from "@/lib/auth/account";
import { canManageTeam, canScanEvent, scanRoleLabel } from "@/lib/scan/access";
import { EVENT_ID } from "@/lib/scan/codes";
import { scanCounts } from "@/lib/scan/redeem";
import { Scanner } from "./scanner";

export const metadata: Metadata = { title: "Check-in" };

async function ScanScreen({ params }: { params: Promise<{ id: string }> }) {
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
  if (!canScanEvent(account, ref)) redirect("/console/events");
  let counts = { checkedIn: 0, total: 0 };
  try {
    counts = await scanCounts(event.id, account.profile.id);
  } catch {
    counts = { checkedIn: 0, total: 0 };
  }
  const name = account.profile.full_name?.trim() || "there";
  return (
    <main className="mx-auto w-full max-w-lg space-y-5 bg-white px-4 py-6">
      <header>
        <p className="mb-2 text-sm font-bold uppercase tracking-widest text-teal">Check-in</p>
        <h1 className="text-3xl font-extrabold text-ink">{event.title}</h1>
        <p className="mt-2 text-muted">
          Signed in as {name} ({scanRoleLabel(account, ref)})
        </p>
      </header>
      <Scanner eventId={event.id} checkedIn={counts.checkedIn} total={counts.total} />
      {canManageTeam(account, ref) && (
        <p>
          <Link
            className="font-semibold text-teal underline"
            href={`/console/events/${event.id}/team`}
          >
            Team for this event
          </Link>
        </p>
      )}
    </main>
  );
}

export default function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="p-8">Loading the scanner…</p>}>
      <ScanScreen params={params} />
    </Suspense>
  );
}
