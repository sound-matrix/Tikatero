import { Suspense } from "react";
import { requireStaff } from "@/lib/admin/access";
import { AdminPage } from "@/components/admin/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { earningsReconciliation } from "@/lib/payouts/earnings";
import { formatInr, formatIst } from "@/lib/format";

async function Reconciliation() {
  const { client } = await requireStaff();
  const [{ data, error }, earnings] = await Promise.all([
    client.rpc("admin_gateway_reconciliation"),
    earningsReconciliation(client),
  ]);
  if (error) throw new Error("Gateway costs could not be loaded.");
  const rows = data ?? [];
  return (
    <AdminPage
      title="Gateway costs"
      description="When the platform absorbs the payment gateway, that cost stays with the platform. The organiser's share is unchanged."
    >
      <Card>
        <h2 className="text-xl font-bold">Host earnings reconciliation</h2>
        <p className="mt-2">
          Collected {formatInr(earnings.collected_paise)} · Host refunds{" "}
          {formatInr(earnings.refunds_paise)} · Transfers {formatInr(earnings.paid_paise)} ·
          Adjustments {formatInr(earnings.adjustments_paise)}
        </p>
        <p className="mt-2">
          Expected balance {formatInr(earnings.expected_paise)} · Recorded balance{" "}
          {formatInr(earnings.balance_paise)}
        </p>
        {earnings.difference_paise === 0 ? (
          <p className="mt-2 font-semibold text-teal">Balances match.</p>
        ) : (
          <p role="alert" className="mt-2 font-semibold text-danger">
            Balance mismatch {formatInr(earnings.difference_paise)}
          </p>
        )}
      </Card>
      <Button href="/admin/reconciliation/export" variant="primary">
        Download staff CSV
      </Button>
      <Card className="overflow-x-auto p-0!">
        <table className="w-full min-w-[760px] text-left text-sm">
          <caption className="sr-only">Absorbed gateway costs</caption>
          <thead className="bg-soft text-muted">
            <tr>
              {[
                "Event",
                "Organiser share",
                "Platform share",
                "Gateway cost",
                "Platform net",
                "Paid",
              ].map((label) => (
                <th key={label} scope="col" className="p-4">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.order_id} className="border-t border-line">
                <td className="p-4 font-semibold">
                  {row.event_title}
                  {row.is_test && <small className="mt-1 block font-normal text-muted">Test</small>}
                </td>
                <td className="p-4">{formatInr(row.organiser_share_paise)}</td>
                <td className="p-4">{formatInr(row.platform_share_paise)}</td>
                <td className="p-4">{formatInr(row.absorbed_gateway_paise)}</td>
                <td className="p-4">{formatInr(row.platform_net_paise)}</td>
                <td className="p-4">{row.paid_at ? formatIst(row.paid_at) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="p-8 text-center text-muted">No absorbed gateway costs yet.</p>
        )}
      </Card>
    </AdminPage>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="p-8">Loading gateway costs…</p>}>
      <Reconciliation />
    </Suspense>
  );
}
