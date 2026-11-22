import Link from "next/link";
import { AdminPage } from "@/components/admin/page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/admin/access";
import { eventStatement } from "@/lib/payouts/event-statement";
import { formatInr, formatIst } from "@/lib/format";
import { PayoutForm } from "../../form";

type Props = { params: Promise<{ id: string }> };

export default async function FinalEventSettlement({ params }: Props) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid event.");
  const { client } = await requireStaff();
  const s = await eventStatement(client, id);
  const ready = s.status === "ready_for_manual_transfer";
  const amount = s.remaining_host_paise;
  const fields = [
    ["Captured ticket payments", formatInr(s.gross_collected_paise)],
    ["Tikatero fees", formatInr(s.platform_fee_paise)],
    ["GST on fees", formatInr(s.platform_fee_gst_paise)],
    ["Payment gateway costs (allocation depends on fee policy)", formatInr(s.gateway_fee_paise)],
    ["Processed customer refunds", formatInr(s.processed_refund_paise)],
    ["Host share already transferred", formatInr(s.paid_out_paise)],
    ["Host balance outstanding", formatInr(amount)],
  ] as const;
  return (
    <AdminPage title="Final event settlement" description="One event, one reconciled amount. Send the bank transfer externally first, then record its UTR here.">
      <Card className="space-y-4">
        <Link href="/admin/payouts" className="text-teal underline">Back to Host payouts</Link>
        <h2 className="text-2xl font-bold">{s.event_title} · {s.host_name}</h2>
        <p>Booking closes: {s.booking_close_at ? formatIst(s.booking_close_at) : "—"}</p>
        <p>Event ends: {s.event_ends_at ? formatIst(s.event_ends_at) : "—"}</p>
        <p className="font-semibold">Settlement status: {s.status.replaceAll("_", " ")}</p>
        <p>Paid bookings: {s.paid_booking_count} · Unreconciled payments: {s.pending_order_count} · Unresolved refunds: {s.pending_refund_count}</p>
        <table className="w-full text-sm">
          <tbody>{fields.map(([label, total]) =>
            <tr className="border-t border-line" key={label}>
              <th scope="row" className="py-2 text-left">{label}</th>
              <td className="py-2 text-right font-semibold">{total}</td>
            </tr>)}</tbody>
        </table>
        <Button href={`/api/settlements/${id}/csv`} prefetch={false}>Download event settlement CSV</Button>
      </Card>
      <Card>
        <h2 className="text-xl font-bold">Record final host transfer</h2>
        {ready && amount > 0 ? (
          <>
            <p className="my-3 font-semibold">Exact amount: {formatInr(amount)}</p>
            <p className="my-2 text-sm text-muted">Transfer the exact amount to the host's previously verified bank account outside Tikatero. This action only records an already-completed transfer.</p>
            <PayoutForm className="max-w-lg space-y-3">
              <input type="hidden" name="operation" value="final" />
              <input type="hidden" name="event" value={id} />
              <label className="block">Transfer method
                <select name="method" required className="block w-full rounded-lg border p-2">
                  <option value="neft">NEFT</option><option value="imps">IMPS</option>
                  <option value="rtgs">RTGS</option><option value="upi">UPI</option>
                </select>
              </label>
              <label className="block">Bank reference (UTR)
                <input name="reference" required maxLength={80} className="block w-full rounded-lg border p-2" />
              </label>
              <label className="block">Date transferred (IST)
                <input name="paidOn" type="date" required className="block w-full rounded-lg border p-2" />
              </label>
              <label className="block">Notes (optional)
                <input name="note" maxLength={1000} className="block w-full rounded-lg border p-2" />
              </label>
              <Button type="submit" variant="primary">Record completed bank transfer</Button>
            </PayoutForm>
          </>
        ) : (
          <p className="mt-2 text-muted">Payment is locked until bookings close, PayU transactions and refunds reconcile, the event ends and the payout hold window expires.</p>
        )}
      </Card>
    </AdminPage>
  );
}
