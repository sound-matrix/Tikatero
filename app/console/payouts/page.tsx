import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAccount } from "@/lib/auth/account";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatInr, formatIst } from "@/lib/format";
import { earningsPaymentCopy, hostEarnings, paymentDate } from "@/lib/payouts/earnings";
import { PayoutBankForm } from "./bank-form";

export const metadata: Metadata = { title: "Your earnings" };
type Props = { searchParams: Promise<{ test?: string }> };

async function Payouts({ searchParams }: Props) {
  const { client, account } = await requireAccount();
  const test = (await searchParams).test === "true";
  const [{ events, history, hold_days, has_test, ...totals }, { data: hosts }] = await Promise.all([
    hostEarnings(client, test),
    client
      .from("organisers")
      .select("id,display_name")
      .eq("owner_id", account.profile.id)
      .eq("kyc_status", "approved"),
  ]);
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Your earnings</h1>
          <p className="mt-2 max-w-2xl text-muted">{earningsPaymentCopy(hold_days)}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button href="/console/payouts/export.xlsx" prefetch={false}>
            Download Excel
          </Button>
          <Button href="/console/payouts/export" prefetch={false}>
            Download CSV
          </Button>
        </div>
      </header>
      {(test || has_test) && (
        <div className="flex flex-wrap items-center gap-4">
          {test && (
            <p className="rounded-xl bg-gold-soft p-3 text-sm">
              Test records. No money was sent to your bank.
            </p>
          )}
          <Button href={test ? "/console/payouts" : "/console/payouts?test=true"}>
            {test ? "Show real payments" : "Show test records"}
          </Button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Your earnings", formatInr(totals.earnings_paise)],
          ["Paid to you", formatInr(totals.paid_paise)],
          ["Still to be paid", formatInr(totals.remaining_paise)],
          [
            "Next payment date",
            totals.next_available_at ? formatIst(totals.next_available_at) : "—",
          ],
        ].map(([label, value]) => (
          <Card key={label}>
            <p className="text-sm text-muted">{label}</p>
            <p className="mt-2 text-xl font-bold">{value}</p>
          </Card>
        ))}
      </div>
      <Card className="overflow-x-auto">
        <h2 className="mb-3 text-xl font-bold">By event</h2>
        <table className="w-full min-w-[950px] text-left text-sm">
          <thead>
            <tr>
              {[
                "Event",
                "Ticket money",
                "Tikatero fee",
                "GST on fee",
                "Payment charges",
                "Refunds",
                "Your earnings",
                "Paid to you",
                "Still to be paid",
              ].map((label) => (
                <th key={label} className="p-2" scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="border-t border-line">
                <th scope="row" className="p-2 font-semibold">
                  {event.title}
                </th>
                {[
                  event.gross_paise,
                  event.fee_paise,
                  event.gst_paise,
                  event.charges_paise,
                  event.refunds_paise,
                  event.earnings_paise,
                  event.paid_paise,
                  event.remaining_paise,
                ].map((amount, index) => (
                  <td className="p-2" key={index}>
                    {formatInr(amount)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!events.length && <p className="mt-4 text-muted">No event earnings yet.</p>}
      </Card>
      <Card className="overflow-x-auto">
        <h2 className="mb-3 text-xl font-bold">Payment history</h2>
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr>
              {["Date", "Amount", "Method", "Bank reference", "Event", "Status"].map((label) => (
                <th key={label} className="p-2" scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.map((row) => (
              <tr key={row.id} className="border-t border-line">
                {[
                  paymentDate(row),
                  formatInr(row.amount_paise),
                  row.method?.toUpperCase(),
                  row.bank_reference,
                  row.event_title ?? "All events",
                  row.voided_at ? "Voided" : "Paid",
                ].map((cell, index) => (
                  <td className="p-2" key={index}>
                    {cell ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!history.length && <p className="mt-4 text-muted">No payments recorded yet.</p>}
      </Card>
      {!!hosts?.length && (
        <Card>
          <PayoutBankForm
            hosts={hosts.map((host) => ({ id: host.id, title: host.display_name }))}
          />
        </Card>
      )}
    </main>
  );
}

export default function Page(props: Props) {
  return (
    <Suspense fallback={<p className="p-8">Loading earnings…</p>}>
      <Payouts {...props} />
    </Suspense>
  );
}
