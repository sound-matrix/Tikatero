import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/admin/access";
import { EventMedia } from "@/components/discovery/media";
import { EventModeration } from "@/components/events/event-moderation";
import { RefundDeskView } from "@/components/refunds/refund-desk";
import { loadRefundDesk } from "@/lib/refunds/desk";
import { loadAdminEventReview } from "@/lib/events/moderation-store";
import { statusLabel } from "@/lib/events/model";
import { statusLabels } from "@/lib/admin/model";
import { formatInr, formatIst } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Event review" };
type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    refund?: string;
    refund_error?: string;
    notice?: string;
    review_error?: string;
  }>;
};
const historyLabels: Record<string, string> = {
  event_hidden: "Event hidden",
  event_unhidden: "Event shown again",
  event_removal_requested: "Removal requested",
  event_removal_withdrawn: "Request withdrawn",
  event_removal_rejected: "Request declined",
  event_removal_approved: "Removal approved",
  event_cancelled: "Event cancelled",
};

async function Review({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { client, account } = await requireStaff();
  const [review, desk] = await Promise.all([
    loadAdminEventReview(id, client),
    loadRefundDesk(client, id),
  ]);
  if (!review) notFound();
  const { event, host, tickets, request, history, hasOrders } = review;
  const own =
    account.organisers.some((org) => org.id === event.organiser_id) ||
    account.assignments?.some((item) => item.eventId === id && item.role === "manager");
  const gross =
    desk?.orders.reduce((total, order) => total + (order.isTest ? 0 : order.totalPaise), 0) ?? 0;
  const sold = tickets.reduce((total, ticket) => total + ticket.qty_sold, 0);
  const queued =
    event.status === "cancelled" &&
    (desk?.orders.some((order) => order.status !== "refunded" && order.totalPaise > 0) ?? false);
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-8">
      <Button href="/admin/events">All events</Button>
      <div>
        <h1 className="text-3xl font-extrabold">{event.title}</h1>
        <p className="mt-2 text-sm font-semibold text-teal">
          {statusLabel(event.status, event.ends_at, event.starts_at)}
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <EventMedia title={event.title} posterKey={event.poster_key} theme={event.theme} />
        <Card className="space-y-3">
          <h2 className="text-xl font-extrabold">Event details</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-sm">
            <dt className="font-semibold">Organiser</dt>
            <dd>{host.display_name}</dd>
            <dt className="font-semibold">Host ID check</dt>
            <dd>{statusLabels[host.kyc_status] ?? host.kyc_status}</dd>
            <dt className="font-semibold">Starts</dt>
            <dd>{event.starts_at ? formatIst(event.starts_at) : "Date not set"}</dd>
            {event.ends_at && (
              <>
                <dt className="font-semibold">Ends</dt>
                <dd>{formatIst(event.ends_at)}</dd>
              </>
            )}
            {event.gates_open_at && (
              <>
                <dt className="font-semibold">Doors open</dt>
                <dd>{formatIst(event.gates_open_at)}</dd>
              </>
            )}
            <dt className="font-semibold">Venue</dt>
            <dd>
              {[event.venue_name, event.address, event.city, event.country]
                .filter(Boolean)
                .join(", ")}
            </dd>
            <dt className="font-semibold">Tickets sold</dt>
            <dd>{event.capacity ? `${sold} of ${event.capacity} seats` : sold}</dd>
            <dt className="font-semibold">Gross sales</dt>
            <dd>{formatInr(gross)} incl. GST</dd>
          </dl>
          <h3 className="pt-2 font-bold">Ticket types</h3>
          {tickets.length ? (
            <ul className="space-y-2 text-sm">
              {tickets.map((ticket) => (
                <li
                  key={ticket.id}
                  className="flex flex-wrap justify-between gap-2 border-t border-line pt-2"
                >
                  <span className="font-semibold">{ticket.name}</span>
                  <span>
                    {ticket.qty_sold} of {ticket.qty_total} sold ·{" "}
                    {ticket.price_paise
                      ? `${formatInr(ticket.price_paise)} incl. GST`
                      : "Free entry"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No ticket types yet.</p>
          )}
        </Card>
      </div>
      <EventModeration
        event={event}
        request={request}
        staff
        admin={account.profile.role === "admin"}
        own={own}
        hasOrders={hasOrders}
        queued={queued}
        notice={query.notice}
        error={query.review_error}
      />
      <Card className="space-y-3">
        <h2 className="text-xl font-extrabold">Event history</h2>
        {history.length ? (
          <ul className="divide-y divide-line">
            {history.map((entry) => (
              <li key={entry.id} className="py-2">
                <p className="font-semibold">
                  {historyLabels[entry.action] ?? entry.action.replaceAll("_", " ")} ·{" "}
                  {formatIst(entry.created_at)}
                </p>
                {entry.reason && <p className="text-sm text-muted">{entry.reason}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No review activity yet.</p>
        )}
      </Card>
      {desk && (
        <RefundDeskView
          desk={desk}
          asStaff
          notice={query.refund === "updated" ? "The refund has been updated." : undefined}
          error={query.refund_error}
        />
      )}
    </main>
  );
}

export default function Page(props: Props) {
  return (
    <Suspense fallback={<p className="p-8">Loading event…</p>}>
      <Review {...props} />
    </Suspense>
  );
}
