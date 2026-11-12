import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatInr, formatIst } from "@/lib/format";
import { payoutWindowCopy } from "@/lib/payouts/model";
import type { EventSales } from "@/lib/payouts/read";

function money(paise: number) {
  return formatInr(paise);
}

export function SalesFigures({ event, detail = false }: { event: EventSales; detail?: boolean }) {
  const rows = event.is_free
    ? []
    : [
        ["Ticket sales, including GST", event.gross_subtotal_paise],
        ["Platform fee", event.platform_fee_paise],
        ["GST on the platform fee", event.platform_fee_gst_paise],
        ["Payment gateway fee", event.gateway_fee_paise],
        ["Your share", event.organiser_share_paise],
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
        {detail && (
          <Link
            className="font-semibold text-teal underline"
            href={`/console/events/${event.id}/edit`}
          >
            Edit event
          </Link>
        )}
      </div>
      {event.is_free ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <p>
            <span className="block text-sm text-muted">Free passes booked</span>
            <strong className="text-3xl">{event.tickets_sold}</strong>
          </p>
          <p>
            <span className="block text-sm text-muted">Checked in</span>
            <strong className="text-3xl">{event.checked_in}</strong>
          </p>
          <p className="text-sm text-muted sm:col-span-2">
            This is a free event. There is no payout.
          </p>
        </div>
      ) : (
        <>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            {rows.map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="text-lg font-bold">{money(Number(value))}</dd>
              </div>
            ))}
            {event.buyer_total_paise !== event.gross_subtotal_paise && (
              <div>
                <dt className="text-sm text-muted">Buyers paid, including GST</dt>
                <dd className="text-lg font-bold">{money(event.buyer_total_paise)}</dd>
              </div>
            )}
          </dl>
          <p className="mt-4 text-sm text-muted">
            {event.checked_in} checked in of {event.tickets_sold} tickets sold.{" "}
            {payoutWindowCopy(event.payout_days)} Still to be paid: {money(event.to_be_paid_paise)}.
            Prices include GST.
          </p>
          {!event.identity_ok && (
            <p className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">
              These figures need a review. Contact support.
            </p>
          )}
        </>
      )}
      {detail && (
        <ul className="mt-5 space-y-2">
          {event.tiers.map((tier) => (
            <li key={tier.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">
                {tier.name} {tier.is_vip && <Badge variant="vip">VIP</Badge>}
              </span>
              <span className="text-sm text-muted">
                {tier.sold_real} sold of {tier.qty_total} · {money(tier.price_paise)} incl. GST ·
                inventory {tier.qty_sold}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
