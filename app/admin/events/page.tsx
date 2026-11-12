import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireStaff } from "@/lib/admin/access";
import { eventStatuses } from "@/lib/events/moderation-model";
import { statusLabel } from "@/lib/events/model";
import { formatInr, formatIst } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = { title: "Events" };
type Query = { q?: string; status?: string; filter?: string; page?: string; notice?: string };
type Props = { searchParams: Promise<Query> };
const selectClass = "min-h-12 w-full rounded-xl border border-line bg-white px-3";

async function EventList({ searchParams }: Props) {
  const { client } = await requireStaff();
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const status = query.status && eventStatuses.includes(query.status) ? query.status : "";
  const filter = query.filter === "removal" || query.filter === "hidden" ? query.filter : "";
  const requestedPage = Number(query.page);
  const page = Number.isSafeInteger(requestedPage) ? Math.min(1001, Math.max(1, requestedPage)) : 1;
  const { data, error } = await client.rpc("admin_event_review_list", {
    p_search: q,
    p_status: status,
    p_filter: filter,
    p_offset: (page - 1) * 30,
  });
  if (error) throw new Error("Events could not be loaded.");
  const url = (next: number) =>
    `/admin/events?${new URLSearchParams({ q, status, filter, page: String(next) })}`;
  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-8 md:px-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Events</h1>
      {query.notice && (
        <p role="status" className="font-semibold text-teal">
          {query.notice}
        </p>
      )}
      <form className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_auto]">
        <Input label="Search by event or organiser" name="q" defaultValue={q} maxLength={100} />
        <label className="space-y-1 text-sm font-semibold">
          <span>Status</span>
          <select name="status" className={selectClass} defaultValue={status}>
            <option value="">All statuses</option>
            {eventStatuses.map((value) => (
              <option key={value} value={value}>
                {statusLabel(value, null, null)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-semibold">
          <span>Show</span>
          <select name="filter" className={selectClass} defaultValue={filter}>
            <option value="">All events</option>
            <option value="removal">Removal requested</option>
            <option value="hidden">Hidden</option>
          </select>
        </label>
        <Button type="submit" variant="primary">
          Apply filters
        </Button>
      </form>
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[730px] text-left text-sm">
          <caption className="sr-only">All events</caption>
          <thead className="bg-soft text-muted">
            <tr>
              {[
                "Event",
                "Organiser",
                "City",
                "Starts (IST)",
                "Status",
                "Tickets sold",
                "Gross",
              ].map((label) => (
                <th key={label} scope="col" className="px-3 py-4">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((event) => (
              <tr key={event.id} className="border-t border-line">
                <th scope="row" className="px-3 py-4">
                  <Link
                    href={`/admin/events/${event.id}`}
                    className="font-bold text-teal underline"
                  >
                    {event.title}
                  </Link>
                </th>
                <td className="px-3 py-4">{event.organiser_name}</td>
                <td className="px-3 py-4">{event.city || "—"}</td>
                <td className="px-3 py-4">
                  {event.starts_at ? formatIst(event.starts_at) : "Date not set"}
                </td>
                <td className="px-3 py-4">
                  {statusLabel(event.status, null, event.starts_at)}
                  {event.removal_requested && (
                    <span className="mt-1 block font-semibold text-teal">Removal requested</span>
                  )}
                </td>
                <td className="px-3 py-4 tabular-nums">{event.tickets_sold}</td>
                <td className="px-3 py-4 tabular-nums">{formatInr(event.gross_paise)} incl. GST</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.length && (
          <p className="p-6 text-center text-muted">No events match these filters.</p>
        )}
      </div>
      {(page > 1 || (data[0]?.total_count ?? 0) > page * 30) && (
        <nav aria-label="Event list pages" className="flex items-center gap-4">
          {page > 1 && <Button href={url(page - 1)}>Previous</Button>}
          <span>Page {page}</span>
          {(data[0]?.total_count ?? 0) > page * 30 && <Button href={url(page + 1)}>Next</Button>}
        </nav>
      )}
    </main>
  );
}

export default function Page(props: Props) {
  return (
    <Suspense fallback={<p className="p-8">Loading events…</p>}>
      <EventList {...props} />
    </Suspense>
  );
}
