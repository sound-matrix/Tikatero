import { Suspense } from "react";
import { requireStaff } from "@/lib/admin/access";
import { fieldClass, pageNumber, uuid } from "@/lib/admin/model";
import { formatIst } from "@/lib/format";
import { AdminPage, Pager } from "@/components/admin/page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
type Params = {
  actor?: string;
  action?: string;
  target?: string;
  from?: string;
  to?: string;
  page?: string;
};
async function Audit({ searchParams }: { searchParams: Promise<Params> }) {
  const { client } = await requireStaff();
  const params = await searchParams;
  const page = pageNumber(params.page);
  let query = client
    .from("audit_log")
    .select("id,actor_id,action,entity,entity_id,before,after,reason,created_at")
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * 25, page * 25);
  const actor = params.actor?.trim() ?? "",
    target = params.target?.trim() ?? "",
    action = (params.action ?? "").trim().slice(0, 100);
  let invalid = false;
  if (actor) {
    if (uuid(actor)) query = query.eq("actor_id", actor);
    else invalid = true;
  }
  if (target) {
    if (uuid(target)) query = query.eq("entity_id", target);
    else query = query.eq("entity", target.slice(0, 100));
  }
  if (action) query = query.eq("action", action);
  for (const key of ["from", "to"] as const) {
    const day = params[key];
    if (day) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00+05:30`))) {
        const instant = new Date(`${day}T00:00:00+05:30`);
        query =
          key === "from"
            ? query.gte("created_at", instant.toISOString())
            : query.lt("created_at", new Date(instant.getTime() + 86400000).toISOString());
      } else invalid = true;
    }
  }
  const { data, error } = invalid ? { data: [], error: null } : await query;
  if (error) throw new Error("The audit log could not be loaded.");
  const rows = (data ?? []).slice(0, 25);
  const ids = [...new Set(rows.flatMap((r) => (r.actor_id ? [r.actor_id] : [])))];
  const { data: actors, error: actorError } = ids.length
    ? await client.from("profiles").select("id,full_name").in("id", ids)
    : { data: [], error: null };
  if (actorError) throw new Error("Staff names could not be loaded.");
  return (
    <AdminPage title="Audit log" description="Log can't be edited or deleted.">
      <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          { name: "actor", label: "Actor ID", type: "text" },
          { name: "action", label: "Action", type: "text" },
          { name: "target", label: "Target ID or table", type: "text" },
          { name: "from", label: "From date (IST)", type: "date" },
          { name: "to", label: "To date (IST)", type: "date" },
        ].map((f) => (
          <label key={f.name} className="text-sm font-semibold">
            {f.label}
            <input
              name={f.name}
              type={f.type}
              defaultValue={params[f.name as keyof Params]}
              className={`${fieldClass} mt-2`}
              maxLength={100}
            />
          </label>
        ))}
        <Button type="submit" className="self-end">
          Filter
        </Button>
      </form>
      {invalid && <p role="alert">Enter a valid actor UUID and date range.</p>}
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[850px] text-left text-sm">
          <caption className="sr-only">Read-only staff action history</caption>
          <thead className="bg-soft text-muted">
            <tr>
              {["Time (IST)", "Actor", "Action", "Target", "Change"].map((h) => (
                <th key={h} scope="col" className="p-4">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line align-top">
                <td className="p-4 whitespace-nowrap">{formatIst(row.created_at)}</td>
                <td className="p-4">
                  <span className="font-semibold">
                    {actors?.find((a) => a.id === row.actor_id)?.full_name || "Staff"}
                  </span>
                  <small className="mt-1 block break-all text-muted">{row.actor_id}</small>
                </td>
                <td className="p-4 font-semibold">{row.action}</td>
                <td className="p-4">
                  {row.entity}
                  <small className="mt-1 block break-all text-muted">{row.entity_id}</small>
                </td>
                <td className="min-w-64 p-4">
                  <details>
                    <summary className="cursor-pointer font-semibold text-teal">
                      Before / after
                    </summary>
                    <p className="mt-3 font-semibold">Before</p>
                    <pre className="max-w-sm overflow-auto rounded-lg bg-soft p-3 text-xs">
                      {JSON.stringify(row.before, null, 2)}
                    </pre>
                    <p className="mt-3 font-semibold">After</p>
                    <pre className="max-w-sm overflow-auto rounded-lg bg-soft p-3 text-xs">
                      {JSON.stringify(row.after, null, 2)}
                    </pre>
                  </details>
                  {row.reason && <p className="mt-3">Reason: {row.reason}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-8 text-muted">No actions match these filters.</p>}
      </Card>
      <Pager
        page={page}
        hasMore={(data?.length ?? 0) > 25}
        path="/admin/audit"
        params={{ actor, action, target, from: params.from ?? "", to: params.to ?? "" }}
      />
    </AdminPage>
  );
}
export default function Page(props: { searchParams: Promise<Params> }) {
  return (
    <Suspense fallback={<p className="p-8">Loading audit log…</p>}>
      <Audit {...props} />
    </Suspense>
  );
}
