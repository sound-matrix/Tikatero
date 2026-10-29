import { Suspense } from "react";
import { requireStaff } from "@/lib/admin/access";
import { fieldClass, pageNumber, statusLabels } from "@/lib/admin/model";
import { AdminPage, Pager } from "@/components/admin/page";
import { AccountForm, ControlForm } from "@/components/admin/forms";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
async function Accounts({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { client, account } = await requireStaff();
  const params = await searchParams;
  const q = (params.q ?? "").slice(0, 120);
  const page = pageNumber(params.page);
  const { data: users, error } = await client.rpc("admin_search_accounts", {
    p_query: q,
    p_offset: (page - 1) * 25,
  });
  if (error) throw new Error("Accounts could not be loaded.");
  const ids = (users ?? []).map((u) => u.id);
  const { data: orgs, error: orgError } = ids.length
    ? await client
        .from("organisers")
        .select("id,owner_id,display_name,kyc_status,payouts_on_hold,sales_paused")
        .in("owner_id", ids)
    : { data: [], error: null };
  if (orgError) throw new Error("Organisers could not be loaded.");
  return (
    <AdminPage
      title="Accounts"
      description="Manage account access and organiser controls. Reasons are shown to restricted accounts."
    >
      <form className="flex flex-wrap items-end gap-3">
        <label className="min-w-64 flex-1 font-semibold">
          Search accounts
          <input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={120}
            className={`${fieldClass} mt-2`}
            placeholder="Name, organiser, email or phone"
          />
        </label>
        <Button type="submit">Search</Button>
      </form>
      <p className="text-sm text-muted">
        Suspend restricts account access until a staff member unblocks it. Do not include ID numbers
        or secrets in reasons.
      </p>
      <div className="grid gap-5 xl:grid-cols-2">
        {users?.map((user) => (
          <Card key={user.id}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">{user.full_name || "Unnamed account"}</h2>
                <p className="break-all text-sm text-muted">{user.email || "No email"}</p>
                <p className="text-sm text-muted">
                  {user.phone || "No phone"} · {user.role}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-sm font-semibold ${user.blocked_at ? "bg-soft text-ink" : "bg-teal-soft text-teal"}`}
              >
                {user.blocked_at ? "Restricted" : "Active"}
              </span>
            </div>
            {user.block_reason && (
              <p className="mb-4 rounded-xl bg-soft p-3 text-sm">Reason: {user.block_reason}</p>
            )}
            <AccountForm
              id={user.id}
              blocked={!!user.blocked_at}
              self={user.id === account.profile.id}
            />
            {orgs
              ?.filter((o) => o.owner_id === user.id)
              .map((org) => (
                <section
                  key={org.id}
                  aria-label={org.display_name}
                  className="mt-5 space-y-3 border-t border-line pt-4"
                >
                  <h3 className="font-bold">{org.display_name}</h3>
                  <p className="text-sm text-muted">{statusLabels[org.kyc_status]}</p>
                  <ControlForm
                    id={org.id}
                    control="payouts_on_hold"
                    enabled={org.payouts_on_hold}
                  />
                  <ControlForm id={org.id} control="sales_paused" enabled={org.sales_paused} />
                </section>
              ))}
          </Card>
        ))}
      </div>
      {!users?.length && <Card>No accounts match your search.</Card>}
      <Pager page={page} hasMore={users?.length === 25} path="/admin/accounts" params={{ q }} />
    </AdminPage>
  );
}
export default function Page(props: { searchParams: Promise<{ q?: string; page?: string }> }) {
  return (
    <Suspense fallback={<p className="p-8">Loading accounts…</p>}>
      <Accounts {...props} />
    </Suspense>
  );
}
