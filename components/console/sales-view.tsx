import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatInr, formatIst } from "@/lib/format";
import { payoutWindowCopy } from "@/lib/payouts/model";
import type { EventSales, LiveSales } from "@/lib/payouts/read";
import { shareChannel, shareChannels } from "@/lib/sharing/links";

const integer = new Intl.NumberFormat("en-IN");

function SalesByDay({ days }: { days: LiveSales["sales_by_day"] }) {
  if (!days.some((day) => day.orders))
    return <p className="text-sm text-muted">No bookings in the last 30 days.</p>;
  const peak = Math.max(...days.map((day) => day.orders), 1);
  const last = days.at(-1)!.date;
  const toDay = (date: string) => Date.parse(date) / 86400000;
  return (
    <svg
      className="h-28 w-full max-w-xl"
      viewBox="0 0 300 100"
      preserveAspectRatio="none"
      role="img"
      aria-label="Daily bookings over the last 30 days"
    >
      {days.map((day) => {
        const height = (98 * day.orders) / peak;
        const dayIndex = 29 - (toDay(last) - toDay(day.date));
        return (
          <rect
            key={day.date}
            x={dayIndex * 10}
            y={100 - height}
            width={8}
            height={height}
            rx="2"
            className="fill-teal"
          >
            <title>{`${day.date} · ${day.orders} bookings · ${formatInr(day.money_paise)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

export function SalesFigures({
  event,
  detail = false,
  staff = false,
  changed = false,
}: {
  event: EventSales;
  detail?: boolean;
  staff?: boolean;
  changed?: boolean;
}) {
  const { live } = event;
  const cards: [string, string][] = [
    ["Tickets sold", integer.format(live.tickets_sold)],
    ["Tickets left", integer.format(live.tickets_left)],
    ["Your share", formatInr(live.share_paise)],
  ];
  if (detail)
    cards.push(
      ["Money from tickets", formatInr(live.ticket_money_paise)],
      ["Already paid to you", formatInr(live.paid_out_paise)],
      ["To be paid", formatInr(live.to_be_paid_paise)],
      ["On hold", formatInr(live.on_hold_paise)],
      ["Refunds", `${integer.format(live.refund_count)} · ${formatInr(live.refunded_paise)}`],
      ["Checked in", integer.format(live.checked_in)],
    );
  const breakdown: [string, number][] = [
    ["Buyers paid", live.buyer_paid_paise],
    ["Tikatero fee", -live.fee_paise],
    ["GST on fee", -live.fee_gst_paise],
    ["Payment gateway fee", -live.gateway_paise],
    ["Your part of refunds", -live.organiser_refunds_paise],
    ["Your share", live.share_paise],
  ];
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{event.title}</h2>
          <p className="mt-1 text-sm text-muted">
            {event.starts_at ? formatIst(event.starts_at) : "Date not set"}
          </p>
        </div>
        {detail && !staff && (
          <Link
            className="font-semibold text-teal underline"
            href={`/console/events/${event.id}/edit`}
          >
            Edit event
          </Link>
        )}
      </div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        {cards.map(([label, value]) => (
          <div
            key={label}
            className={`rounded-xl border border-line p-4 transition-colors duration-700 ${changed ? "bg-teal-soft" : "bg-white"}`}
          >
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="mt-1 text-2xl font-bold">{value}</dd>
          </div>
        ))}
      </dl>
      {detail && (
        <div className="mt-5 space-y-4">
          <p className="text-sm text-muted">
            {event.is_free ? "Free passes booked." : "Amounts include GST."} {live.qty_held} being
            booked now.
            {live.capacity !== null &&
              ` Seats left at venue: ${live.seats_left} of ${live.capacity}.`}
          </p>
          {live.expected_at && (
            <p className="text-sm text-muted">
              Next expected payment {formatIst(live.expected_at)}.{" "}
              {payoutWindowCopy(event.payout_days)}
            </p>
          )}
          <a className="font-semibold text-teal underline" href="#refunds">
            {live.refund_requests_pending} refund requests waiting for approval
          </a>
          <details className="rounded-xl border border-line p-4">
            <summary className="cursor-pointer font-bold">How we worked this out</summary>
            <dl className="mt-3 space-y-2">
              {breakdown.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt>{label}</dt>
                  <dd>{formatInr(value)}</dd>
                </div>
              ))}
            </dl>
          </details>
          {!event.identity_ok && (
            <p className="rounded-xl bg-danger-soft p-3 text-sm text-danger">
              These figures need a review. Contact support.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <caption className="mb-2 text-left text-lg font-bold">Ticket types</caption>
              <thead className="bg-soft">
                <tr>
                  {[
                    "Name",
                    "Price",
                    "Sold",
                    "Left",
                    "Being booked now",
                    "Money",
                    "Your share",
                    "Checked in",
                  ].map((label) => (
                    <th scope="col" key={label} className="p-2">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {live.ticket_types.map((row) => (
                  <tr key={row.id} className="border-b border-line">
                    <th scope="row" className="p-2">
                      {row.name}
                    </th>
                    <td className="p-2">
                      {row.price_paise ? formatInr(row.price_paise) : "Free pass"}
                    </td>
                    <td className="p-2">{row.sold}</td>
                    <td className="p-2">{row.left}</td>
                    <td className="p-2">{row.qty_held}</td>
                    <td className="p-2">{formatInr(row.money_paise)}</td>
                    <td className="p-2">{formatInr(row.share_paise)}</td>
                    <td className="p-2">{row.checked_in}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section className="space-y-2">
            <h3 className="text-lg font-bold">Sales by day</h3>
            <SalesByDay days={live.sales_by_day} />
          </section>
          {live.channels && (
            <section>
              <h3 className="text-lg font-bold">Where buyers came from</h3>
              <ul className="space-y-1 text-sm">
                {live.channels.map((row) => {
                  const key = shareChannel(row.channel);
                  return (
                    <li key={row.channel}>
                      {key ? shareChannels[key] : row.channel} · {row.bookings} bookings
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </Card>
  );
}
