import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAccount } from "@/lib/auth/account";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatInr, formatIst } from "@/lib/format";
import { activePricing } from "@/lib/pricing/data";
import { payoutWindowCopy, payoutWindowDays } from "@/lib/payouts/model";

export const metadata: Metadata = { title: "Payouts" };

const labels: Record<string, string> = {
  scheduled: "To be paid",
  settled: "Paid",
  failed: "Could not be paid",
  on_hold: "On hold",
  cancelled: "Not paid · refunded",
};

async function Payouts() {
  const { client, account } = await requireAccount();
  if (!account.organisers.length) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-3xl font-extrabold">Payouts</h1>
        <p className="mt-3 text-muted">Payouts are available to organiser accounts.</p>
      </main>
    );
  }
  const { data, error } = await client
    .from("payouts")
    .select("id, amount_paise, status, expected_at, settled_at, is_test, events(title)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error("Your payouts could not be loaded. Try again.");
  const pricing = await activePricing();
  const rows = data ?? [];
  const testMode = rows.some((row) => row.is_test);
  const toPay = rows
    .filter((row) => row.status === "scheduled" && !row.is_test)
    .reduce((sum, row) => sum + row.amount_paise, 0);
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-bold uppercase tracking-widest text-teal">Payouts</p>
          <h1 className="text-3xl font-extrabold">Money from ticket sales</h1>
          <p className="mt-2 max-w-2xl text-muted">
            {payoutWindowCopy(payoutWindowDays(pricing.payout_days))} Amounts include GST and are
            shown in India time.
          </p>
        </div>
        <Button href="/console/payouts/export" variant="primary">
          Download CSV
        </Button>
      </header>
      {testMode && (
        <p className="rounded-2xl border border-line bg-gold-soft p-4 text-sm">
          Payouts are in test mode. No money has been sent to a bank.
        </p>
      )}
      <p className="text-lg">
        To be paid: <strong>{formatInr(toPay)}</strong>
      </p>
      <Card className="overflow-x-auto p-0!">
        <table className="w-full min-w-[640px] text-left">
          <caption className="sr-only">Payouts for your organisers</caption>
          <thead className="bg-soft text-sm text-muted">
            <tr>
              {["Event", "Amount", "Status", "Expected", "Paid"].map((label) => (
                <th key={label} scope="col" className="p-4">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const event = Array.isArray(row.events) ? row.events[0] : row.events;
              return (
                <tr key={row.id} className="border-t border-line">
                  <td className="p-4 font-semibold">{event?.title || "Event"}</td>
                  <td className="p-4">{formatInr(row.amount_paise)}</td>
                  <td className="p-4">
                    {labels[row.status] || row.status}
                    {row.is_test && (
                      <small className="mt-1 block font-normal text-muted">
                        Test. No money has been sent to a bank.
                      </small>
                    )}
                  </td>
                  <td className="p-4 text-sm">
                    {row.expected_at ? formatIst(row.expected_at) : "—"}
                  </td>
                  <td className="p-4 text-sm">
                    {row.settled_at ? formatIst(row.settled_at) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <p className="p-8 text-center text-muted">No payouts yet.</p>}
      </Card>
    </main>
  );
}

export default function ConsolePayoutsPage() {
  return (
    <Suspense fallback={<p className="p-8">Loading payouts…</p>}>
      <Payouts />
    </Suspense>
  );
}
