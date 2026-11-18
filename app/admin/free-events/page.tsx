import { requireStaff } from "@/lib/admin/access";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decideFreeEventRequest } from "@/app/free-events/actions";
import Link from "next/link";

export default async function FreeEventApprovals() {
  const { account } = await requireStaff();
  if (account.profile.role !== "admin")
    return <main className="p-8">Only Tikatero administrators can approve additional free events.</main>;
  const db = createServiceClient() as unknown as SupabaseClient;
  const { data: requests, error } = await db.from("free_event_requests")
    .select("id,event_id,organiser_id,reason,status,admin_note,created_at,events(title,category,city,starts_at),organisers(display_name)")
    .order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error("Free event requests could not be loaded.");
  const ids = [...new Set((requests ?? []).map(r => r.organiser_id))];
  const { data: usages } = ids.length ? await db.from("free_event_publications").select("organiser_id,event_id").in("organiser_id",ids)
    : { data: [] as { organiser_id: string; event_id: string }[] };
  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-8">
    <Link href="/admin" className="text-teal underline">Back to admin</Link>
    <h1 className="text-3xl font-bold">Free Event Requests</h1>
    <p className="text-muted">Approve or reject each additional free event separately. Every decision requires an explanation.</p>
    {(requests ?? []).length === 0 && <p>No requests yet.</p>}
    {(requests ?? []).map((r) => {
      const event = Array.isArray(r.events) ? r.events[0] : r.events;
      const organiser = Array.isArray(r.organisers) ? r.organisers[0] : r.organisers;
      return <section key={r.id} className="space-y-3 rounded-2xl border border-line p-5">
        <div className="flex flex-wrap justify-between gap-2">
          <div><h2 className="text-xl font-bold">{event?.title ?? r.event_id}</h2>
          <p className="text-muted">{organiser?.display_name ?? r.organiser_id} · {event?.category} · {event?.city}</p></div>
          <span className="font-semibold">{r.status}</span>
        </div>
        <p>Event date: {event?.starts_at ?? "Not set"} · Previous free publications: {(usages ?? []).filter(u => u.organiser_id === r.organiser_id).length}</p>
        <p><strong>Host explanation:</strong> {r.reason}</p>
        {r.admin_note && <p><strong>Admin note:</strong> {r.admin_note}</p>}
        {r.status === "pending" && <form action={decideFreeEventRequest} className="space-y-3">
          <input type="hidden" name="request_id" value={r.id}/>
          <label className="block space-y-2"><span>Decision reason (required)</span>
            <textarea name="note" minLength={10} maxLength={1000} required className="min-h-20 w-full rounded-xl border border-line p-3"/></label>
          <div className="flex gap-3">
            <button name="decision" value="approved" className="rounded-xl bg-teal px-5 py-3 font-semibold text-white">Approve event</button>
            <button name="decision" value="rejected" className="rounded-xl border border-line px-5 py-3 font-semibold">Reject request</button>
          </div>
        </form>}
      </section>;
    })}
  </main>;
}
