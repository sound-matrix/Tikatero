import { Suspense } from "react";
import Link from "next/link";
import { requireAccount } from "@/lib/auth/account";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatIst } from "@/lib/format";
import { statusLabel } from "@/lib/events/model";
async function Events({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { client, account } = await requireAccount();
  const params = await searchParams;
  const n = Number(params.page),
    page = Number.isSafeInteger(n) && n > 0 ? Math.min(n, 10000) : 1;
  const ids = account.organisers.map((o) => o.id);
  const assigned = account.assignments ?? [];
  const teamOnly = ids.length === 0 && assigned.length > 0;
  const { data, error } = ids.length
    ? await client
        .from("events")
        .select("id,organiser_id,title,status,starts_at,ends_at,updated_at,is_free,wizard_step")
        .in("organiser_id", ids)
        .order("updated_at", { ascending: false })
        .order("id")
        .range((page - 1) * 25, page * 25)
    : teamOnly
      ? await client
          .from("events")
          .select("id,title,status,starts_at,ends_at,updated_at")
          .in(
            "id",
            assigned.map((item) => item.eventId),
          )
          .order("starts_at", { ascending: true })
          .order("id")
      : { data: [], error: null };
  if (error) throw new Error("Your events could not be loaded. Try again.");
  const rows = (data ?? []).slice(0, 25);
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-bold uppercase tracking-widest text-teal">
            Organiser console
          </p>
          <h1 className="text-3xl font-extrabold">{teamOnly ? "Your check-in" : "Your events"}</h1>
          <p className="mt-2 text-muted">
            {teamOnly
              ? "Open the scanner for an event you were invited to."
              : "Continue a draft or update your event details."}
          </p>
        </div>
        {!teamOnly && (
          <Button href="/console/events/new" variant="primary">
            Create event
          </Button>
        )}
      </header>
      {account.organisers.some((o) => o.kyc_status !== "approved") && (
        <p className="rounded-xl bg-gold-soft p-4 text-sm">
          You can prepare drafts now. Publishing needs approved organiser verification.
        </p>
      )}
      <Card className="overflow-x-auto p-0!">
        <table className="w-full min-w-[580px] text-left">
          <caption className="sr-only">Events belonging to your organisers</caption>
          <thead className="bg-soft text-sm text-muted">
            <tr>
              {["Event", "Starts (IST)", "Status", ""].map((label, i) => (
                <th scope="col" key={i} className="p-4">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const label = statusLabel(row.status, row.ends_at, row.starts_at);
              return (
                <tr key={row.id} className="border-t border-line">
                  <td className="p-4 font-semibold">
                    {row.title}
                    {"is_free" in row && (
                      <small className="mt-1 block font-normal text-muted">
                        {row.is_free ? "Free · RSVP only" : "Paid entry"}
                      </small>
                    )}
                  </td>
                  <td className="p-4 text-sm">
                    {row.starts_at ? formatIst(row.starts_at) : "Date not set"}
                  </td>
                  <td className="p-4">
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-bold ${label === "Published" ? "bg-teal-soft text-teal" : label === "Draft" ? "bg-gold-soft text-gold-ink" : "bg-soft text-muted"}`}
                    >
                      {label}
                    </span>
                  </td>
                  <td className="space-x-3 p-4">
                    {!teamOnly && (
                      <Link
                        className="font-semibold text-teal underline"
                        href={`/console/events/${row.id}/edit`}
                      >
                        {row.status === "draft" ? "Continue" : "Edit"}
                      </Link>
                    )}
                    {(!teamOnly ||
                      assigned.some(
                        (item) => item.eventId === row.id && item.role === "manager",
                      )) && (
                      <Link
                        className="font-semibold text-teal underline"
                        href={`/console/events/${row.id}`}
                      >
                        Sales
                      </Link>
                    )}
                    {(!teamOnly ||
                      assigned.some(
                        (item) => item.eventId === row.id && item.role === "manager",
                      )) && (
                      <Link
                        className="font-semibold text-teal underline"
                        href={`/console/events/${row.id}/team`}
                      >
                        Team
                      </Link>
                    )}
                    <Link
                      className="font-semibold text-teal underline"
                      href={`/console/events/${row.id}/scan`}
                    >
                      Scan
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <div className="space-y-3 p-8 text-center">
            <p className="text-xl font-bold">Your next event starts here</p>
            <p className="text-muted">
              Create an event step by step. Your progress stays saved after every step.
            </p>
          </div>
        )}
      </Card>
      <nav aria-label="Event list pages" className="flex items-center gap-5">
        {page > 1 && (
          <Link className="text-teal underline" href={`/console/events?page=${page - 1}`}>
            Previous
          </Link>
        )}
        <span className="text-sm text-muted">Page {page}</span>
        {(data?.length ?? 0) > 25 && (
          <Link className="text-teal underline" href={`/console/events?page=${page + 1}`}>
            Next
          </Link>
        )}
      </nav>
    </main>
  );
}
export default function Page(props: { searchParams: Promise<{ page?: string }> }) {
  return (
    <Suspense fallback={<p className="p-8">Loading your events…</p>}>
      <Events {...props} />
    </Suspense>
  );
}
