import { Suspense } from "react";
import Link from "next/link";
import { requireStaff } from "@/lib/admin/access";
import { waitingStatuses, ageLabel, istDayRange } from "@/lib/admin/model";
import { AdminPage } from "@/components/admin/page";
import { Card } from "@/components/ui/card";
async function Dashboard() {
  const { client } = await requireStaff();
  const { start, end } = istDayRange();
  const results = await Promise.all([
    client
      .from("kyc_applications")
      .select("submitted_at", { count: "exact" })
      .in("status", [...waitingStatuses])
      .not("submitted_at", "is", null)
      .order("submitted_at")
      .limit(1),
    client.from("events").select("id", { count: "exact", head: true }).eq("status", "published"),
    client
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("created_at", start)
      .lt("created_at", end),
    client
      .from("payouts")
      .select("id", { count: "exact", head: true })
      .in("status", ["failed", "on_hold"]),
  ]);
  if (results.some((r) => r.error))
    throw new Error("The dashboard could not be loaded. Try again.");
  const tiles = [
    {
      label: "KYC waiting",
      value: results[0].count ?? 0,
      detail: results[0].data?.[0]?.submitted_at
        ? `Oldest: ${ageLabel(results[0].data[0].submitted_at)}`
        : "No waiting applications",
      href: "/admin/kyc",
    },
    {
      label: "Events live",
      value: results[1].count ?? 0,
      detail: "Published events",
      href: "/admin/events",
    },
    { label: "Orders today", value: results[2].count ?? 0, detail: "Today in IST", href: null },
    {
      label: "Payout issues",
      value: results[3].count ?? 0,
      detail: "Failed or on hold",
      href: null,
    },
  ];
  return (
    <AdminPage
      title="Tikatero admin"
      description="Review verification, manage access and follow every staff decision."
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <p className="font-semibold text-muted">{tile.label}</p>
            <p className="my-4 text-4xl font-extrabold text-ink">{tile.value}</p>
            <p className="text-sm text-muted">{tile.detail}</p>
            {tile.href && (
              <Link
                className="mt-4 inline-block font-semibold text-teal underline"
                href={tile.href}
              >
                View {tile.label.toLowerCase()}
              </Link>
            )}
          </Card>
        ))}
      </div>
      <Card>
        <h2 className="text-xl font-bold">Review with confidence</h2>
        <p className="mt-2 text-muted">
          Check each result and the private documents before approving. Simulated checks are
          labelled. Every decision is recorded in the audit log.
        </p>
        <Link href="/admin/audit" className="mt-4 inline-block font-semibold text-teal underline">
          View audit log
        </Link>
      </Card>
    </AdminPage>
  );
}
export default function Page() {
  return (
    <Suspense fallback={<p className="p-8">Loading overview…</p>}>
      <Dashboard />
    </Suspense>
  );
}
