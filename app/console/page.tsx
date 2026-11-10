import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { requireAccount } from "@/lib/auth/account";
import { SalesFigures } from "@/components/console/sales-view";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/format";
import { loadDashboard } from "@/lib/payouts/read";

export const metadata: Metadata = { title: "Organiser console" };

async function Overview() {
  const { client, account } = await requireAccount();
  if (!account.organisers.length) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 md:px-8">
        <h1 className="text-3xl font-extrabold">Check-in</h1>
        <p className="mt-3 text-muted">Open an event from your check-in list to scan tickets.</p>
        <Button className="mt-6" href="/console/events" variant="primary">
          Your check-in
        </Button>
      </main>
    );
  }
  const dashboard = await loadDashboard(client);
  const events = dashboard.organisers.flatMap((org) =>
    org.events.map((event) => ({ ...event, organiser: org.display_name })),
  );
  const toPay = events.reduce((sum, event) => sum + event.to_be_paid_paise, 0);
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-bold uppercase tracking-widest text-teal">
            Organiser console
          </p>
          <h1 className="text-3xl font-extrabold">Your events</h1>
          <p className="mt-2 text-muted">
            Sales and check-ins for approved organisers. Amounts include GST and use India time.
          </p>
        </div>
        <Button href="/console/payouts" variant="primary">
          View payouts
        </Button>
      </header>
      <p className="rounded-2xl border border-line bg-soft p-4">
        Still to be paid across your events: <strong>{formatInr(toPay)}</strong>. Test bookings are
        left out.
      </p>
      {events.map((event) => (
        <section key={event.id} className="space-y-2">
          <p className="text-sm font-semibold text-muted">{event.organiser}</p>
          <SalesFigures event={event} />
          <Link
            className="inline-block font-semibold text-teal underline"
            href={`/console/events/${event.id}`}
          >
            Open {event.title}
          </Link>
        </section>
      ))}
      {!events.length && (
        <div className="rounded-2xl border border-line p-8 text-center">
          <p className="text-xl font-bold">No events yet</p>
          <p className="mt-2 text-muted">Create an event to start selling tickets.</p>
          <Button className="mt-5" href="/console/events/new" variant="primary">
            Create event
          </Button>
        </div>
      )}
    </main>
  );
}

export default function ConsoleHomePage() {
  return (
    <Suspense fallback={<p className="p-8">Loading your sales…</p>}>
      <Overview />
    </Suspense>
  );
}
