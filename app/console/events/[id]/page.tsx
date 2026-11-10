import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAccount } from "@/lib/auth/account";
import { SalesFigures } from "@/components/console/sales-view";
import { Button } from "@/components/ui/button";
import { loadEventSales } from "@/lib/payouts/read";

export const metadata: Metadata = { title: "Event sales" };

async function EventSales({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { client, account } = await requireAccount();
  const sales = await loadEventSales(client, id);
  if (!sales) {
    const assignment = (account.assignments ?? []).find((item) => item.eventId === id);
    if (assignment?.role === "door") redirect(`/console/events/${id}/scan`);
    notFound();
  }
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-8">
      <p className="text-sm font-bold uppercase tracking-widest text-teal">Event sales</p>
      <SalesFigures event={sales} detail />
      <div className="flex flex-wrap gap-3">
        <Button href={`/console/events/${id}/export`} variant="primary">
          Download sales CSV
        </Button>
        <Link
          className="inline-flex min-h-12 items-center font-semibold text-teal underline"
          href={`/console/events/${id}/scan`}
        >
          Open scanner
        </Link>
        <Link
          className="inline-flex min-h-12 items-center font-semibold text-teal underline"
          href="/console"
        >
          All events
        </Link>
      </div>
    </main>
  );
}

export default function Page(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="p-8">Loading sales…</p>}>
      <EventSales {...props} />
    </Suspense>
  );
}
