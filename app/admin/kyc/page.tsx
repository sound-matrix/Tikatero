import { Suspense } from "react";
import Link from "next/link";
import { requireStaff } from "@/lib/admin/access";
import {
  waitingStatuses,
  statusLabels,
  isSimulated,
  fieldClass,
  pageNumber,
  ageLabel,
} from "@/lib/admin/model";
import { formatIst } from "@/lib/format";
import { AdminPage, Pager } from "@/components/admin/page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
async function Queue({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { client } = await requireStaff();
  const params = await searchParams;
  const page = pageNumber(params.page);
  const status = waitingStatuses.find((s) => s === params.status);
  const { data, error } = await client
    .from("kyc_applications")
    .select("id,organiser_id,status,step_progress,submitted_at")
    .in("status", status ? [status] : [...waitingStatuses])
    .not("submitted_at", "is", null)
    .order("submitted_at")
    .order("id")
    .range((page - 1) * 25, page * 25);
  if (error) throw new Error("The verification queue could not be loaded.");
  const rows = (data ?? []).slice(0, 25);
  const ids = [...new Set(rows.map((r) => r.organiser_id))];
  const { data: organisers, error: orgError } = ids.length
    ? await client.from("organisers").select("id,display_name").in("id", ids)
    : { data: [], error: null };
  if (orgError) throw new Error("Organiser names could not be loaded.");
  return (
    <AdminPage
      title="KYC queue"
      description="Oldest submissions first. Review the results and documents before making a decision."
    >
      <form className="flex flex-wrap items-end gap-3">
        <label className="min-w-60 font-semibold">
          Status
          <select name="status" defaultValue={status ?? ""} className={`${fieldClass} mt-2`}>
            <option value="">All waiting</option>
            {waitingStatuses.map((s) => (
              <option key={s} value={s}>
                {statusLabels[s]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit">Apply filter</Button>
      </form>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[650px] text-left">
          <caption className="sr-only">Applications waiting for staff review</caption>
          <thead className="bg-soft text-sm text-muted">
            <tr>
              {["Organiser", "Status", "Submitted (IST)", "Waiting", ""].map((h, i) => (
                <th key={i} scope="col" className="p-4">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line">
                <td className="p-4 font-semibold">
                  {organisers?.find((o) => o.id === row.organiser_id)?.display_name ?? "Organiser"}
                  {isSimulated(row.step_progress) && (
                    <span className="mt-1 block text-xs font-semibold text-muted">
                      Test mode — simulated
                    </span>
                  )}
                </td>
                <td className="p-4">
                  <span className={row.status === "auto_passed" ? "text-teal" : "text-ink"}>
                    {statusLabels[row.status]}
                  </span>
                </td>
                <td className="p-4 text-sm">{formatIst(row.submitted_at!)}</td>
                <td className="p-4 text-muted">{ageLabel(row.submitted_at)}</td>
                <td className="p-4">
                  <Link
                    href={`/admin/kyc/${row.id}`}
                    aria-label={`Review ${organisers?.find((o) => o.id === row.organiser_id)?.display_name ?? "organiser"}`}
                    className="font-bold text-teal underline"
                  >
                    Review
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-8 text-muted">No applications waiting in this filter.</p>}
      </Card>
      <Pager
        page={page}
        hasMore={(data?.length ?? 0) > 25}
        path="/admin/kyc"
        params={{ status: status ?? "" }}
      />
    </AdminPage>
  );
}
export default function Page(props: { searchParams: Promise<{ status?: string; page?: string }> }) {
  return (
    <Suspense fallback={<p className="p-8">Loading verification queue…</p>}>
      <Queue {...props} />
    </Suspense>
  );
}
