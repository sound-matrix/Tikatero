import { issueRefund, reviewRefund } from "@/lib/refunds/actions";
import type { RefundDesk } from "@/lib/refunds/desk";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function RefundDeskView({
  desk,
  asStaff,
  notice,
  error,
}: {
  desk: RefundDesk;
  asStaff: boolean;
  notice?: string;
  error?: string;
}) {
  return (
    <section id="refunds" className="space-y-4">
      <div>
        <h2 className="text-2xl font-extrabold text-ink">Refunds</h2>
        <p className="mt-2 text-muted">{desk.policyText}</p>
        <p className="mt-1 text-muted">
          Amounts include GST. A refund goes back to the original payment method. Test bookings are
          not sent to a bank.
        </p>
      </div>
      {desk.paused && (
        <p className="rounded-xl bg-danger-soft p-3 text-danger">
          Refunds are on hold for this event.
        </p>
      )}
      {notice && <p className="font-semibold text-teal">{notice}</p>}
      {error && <p className="font-semibold text-danger">{error}</p>}
      {asStaff && (
        <p className="rounded-xl bg-soft p-4 text-sm text-ink">
          You are acting as Tikatero staff. If you belong to this organiser, confirm that below
          before you refund.
        </p>
      )}
      {desk.orders.length === 0 && <p className="text-muted">No paid bookings yet.</p>}
      {desk.orders.map((order) => (
        <Card key={order.id}>
          <h3 className="text-lg font-bold">{order.buyerName}</h3>
          <p className="mt-1 text-muted">
            {order.totalLabel} · {order.paidLabel}
          </p>
          <p className="mt-1">
            {order.status === "refunded"
              ? "Refunded"
              : order.status === "partially_refunded"
                ? "Partly refunded"
                : "Paid"}
            {order.isTest ? " · Test booking" : ""}
          </p>
          <p className="mt-1 text-muted">Left to refund: {order.remainingLabel}</p>
          <ul className="mt-3 space-y-1 text-sm">
            {order.tickets.map((ticket) => (
              <li key={ticket.id}>
                {ticket.code} ·{" "}
                {ticket.status === "refunded" ? "Refunded. Not valid for entry." : ticket.status}
              </li>
            ))}
          </ul>
          <ul className="mt-3 space-y-2">
            {order.refunds.map((refund) => (
              <li key={refund.id} className="rounded-xl bg-soft p-3">
                <p>
                  {refund.amountLabel} · {refund.queued ? "Refund queued" : refund.status} ·{" "}
                  {refund.whenLabel}
                </p>
                {refund.rulePercent !== null && (
                  <p className="text-sm text-muted">
                    Offered {refund.rulePercent}% · requested{" "}
                    {refund.hoursBefore === null
                      ? "before the event"
                      : refund.hoursBefore >= 24
                        ? `${Math.floor(refund.hoursBefore / 24)} days before the event`
                        : `${refund.hoursBefore} hours before the event`}
                  </p>
                )}
                {refund.open && (
                  <form action={reviewRefund} className="mt-3 flex flex-wrap gap-3">
                    <input type="hidden" name="refund_id" value={refund.id} />
                    <input type="hidden" name="event_id" value={desk.eventId} />
                    <input type="hidden" name="as" value={asStaff ? "staff" : "organiser"} />
                    {asStaff && (
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="confirm_own" value="yes" />
                        Confirm your own organiser
                      </label>
                    )}
                    <Input
                      label="Refund amount (₹ incl. GST)"
                      name="amount_rupees"
                      defaultValue={refund.offeredRupees}
                      inputMode="decimal"
                      disabled={desk.paused}
                    />
                    <Input
                      label="Reason if lowering the amount or declining"
                      name="reason"
                      maxLength={300}
                    />
                    <Button
                      type="submit"
                      name="decision"
                      value="approve"
                      variant="primary"
                      disabled={desk.paused}
                    >
                      Approve refund
                    </Button>
                    <Button type="submit" name="decision" value="reject">
                      Decline
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {!desk.paused &&
            !order.refunds.some((refund) => refund.open || refund.queued) &&
            order.status !== "refunded" &&
            order.remainingRupees !== "0" && (
              <form action={issueRefund} className="mt-4 space-y-4">
                <input type="hidden" name="order_id" value={order.id} />
                <input type="hidden" name="event_id" value={desk.eventId} />
                <input type="hidden" name="as" value={asStaff ? "staff" : "organiser"} />
                <Input
                  label="Refund amount (INR, incl. GST)"
                  name="amount_rupees"
                  defaultValue={order.remainingRupees}
                  inputMode="decimal"
                  required
                />
                {order.tickets.some((ticket) => ticket.refundable) && (
                  <fieldset>
                    <legend className="mb-2 font-semibold">Unused tickets to refund</legend>
                    {order.tickets
                      .filter((ticket) => ticket.refundable)
                      .map((ticket) => (
                        <label key={ticket.id} className="mb-2 flex items-center gap-2">
                          <input type="checkbox" name="ticket_id" value={ticket.id} />
                          {ticket.code}
                        </label>
                      ))}
                  </fieldset>
                )}
                <Input label="Reason" name="reason" maxLength={300} />
                {asStaff && (
                  <label className="flex items-start gap-3">
                    <input className="mt-1" type="checkbox" name="confirm_own" value="yes" />
                    <span>
                      I belong to this organiser. Confirm you are refunding your own organiser.
                    </span>
                  </label>
                )}
                <Button type="submit" variant="primary">
                  Refund this booking
                </Button>
              </form>
            )}
        </Card>
      ))}
    </section>
  );
}
