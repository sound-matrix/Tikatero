import { EventModeration } from "@/components/events/event-moderation";
import { latestRemovalRequest, loadModerationEvent } from "@/lib/events/moderation-store";
import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAccount } from "@/lib/auth/account";
import { ShareEventCard } from "@/components/console/share-event";
import { LiveSalesFigures } from "@/components/console/live-sales";
import { Button } from "@/components/ui/button";
import { loadEventSales } from "@/lib/payouts/read";
import { loadRefundDesk } from "@/lib/refunds/desk";
import { RefundDeskView } from "@/components/refunds/refund-desk";

export const metadata: Metadata = { title: "Event sales" };

async function EventSales({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    refund?: string;
    refund_error?: string;
    notice?: string;
    review_error?: string;
  }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { client, account } = await requireAccount();
  const sales = await loadEventSales(client, id);
  if (!sales) {
    const assignment = (account.assignments ?? []).find((item) => item.eventId === id);
    if (assignment?.role === "door") redirect(`/console/events/${id}/scan`);
    notFound();
  }
  const [desk, event] = await Promise.all([
    loadRefundDesk(client, id),
    loadModerationEvent(client, id),
  ]);
  const ownsEvent = event && account.organisers.some((org) => org.id === event.organiser_id);
  const request = ownsEvent ? await latestRemovalRequest(client, id) : null;
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-8">
      <p className="text-sm font-bold uppercase tracking-widest text-teal">Event sales</p>
      <LiveSalesFigures initial={sales} />
      {event && ownsEvent && (
        <EventModeration
          event={event}
          request={request}
          notice={query.notice}
          error={query.review_error}
        />
      )}
      {event && ownsEvent && event.status === "published" && !event.hidden_at && (
        <ShareEventCard client={client} event={event} />
      )}
      {desk && (
        <RefundDeskView
          desk={desk}
          asStaff={false}
          notice={query.refund === "updated" ? "The refund has been updated." : undefined}
          error={query.refund_error}
        />
      )}
      <div className="flex flex-wrap gap-3">
        <Button href={`/console/events/${id}/export.xlsx`} variant="primary" prefetch={false}>
          Download Excel
        </Button>
        <Button href={`/console/events/${id}/export`} prefetch={false}>
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

export default function Page(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    refund?: string;
    refund_error?: string;
    notice?: string;
    review_error?: string;
  }>;
}) {
  return (
    <Suspense fallback={<p className="p-8">Loading sales…</p>}>
      <EventSales {...props} />
    </Suspense>
  );
}
