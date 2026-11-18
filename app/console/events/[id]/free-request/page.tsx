import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAccount } from "@/lib/auth/account";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requestFreeEventApproval } from "@/app/free-events/actions";

export default async function FreeEventRequest({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { account } = await requireAccount();
  const db = createServiceClient() as unknown as SupabaseClient;
  const { data: event } = await db.from("events").select("id,title,organiser_id,is_free,status,category,city,starts_at").eq("id",id).maybeSingle();
  if (!event || !event.is_free || !account.organisers.some(o => o.id === event.organiser_id)) notFound();
  const [{ data: previous },{ data: request }] = await Promise.all([
    db.from("free_event_publications").select("event_id").eq("organiser_id",event.organiser_id).limit(1),
    db.from("free_event_requests").select("status,reason,admin_note,reviewed_at").eq("event_id",id).maybeSingle()
  ]);
  return <main className="mx-auto max-w-2xl space-y-5 px-4 py-10">
    <Link href={`/console/events/${id}/edit`} className="text-teal underline">Back to event</Link>
    <h1 className="text-3xl font-bold">Request another free event</h1>
    <p>Every host receives one free event. Additional free events require Tikatero admin approval.</p>
    <div className="rounded-2xl border border-line p-5">
      <h2 className="text-xl font-bold">{event.title}</h2>
      <p className="text-muted">{[event.category,event.city,event.starts_at].filter(Boolean).join(" · ")}</p>
    </div>
    {!previous?.length ? <p>Your first free event can be published normally after verification. No request is needed.</p>
      : request?.status === "approved" ? <p role="status" className="text-teal">Approved. You may now publish this specific event.</p>
      : request?.status === "pending" ? <p role="status">Your request is pending review by Tikatero admin.</p>
      : event.status === "published" ? <p>This event is already published.</p>
      : <form action={requestFreeEventApproval} className="space-y-4 rounded-2xl border border-line p-5">
          {request?.status === "rejected" && <p role="alert">Previous request declined: {request.admin_note ?? "Contact support for details."}</p>}
          <input type="hidden" name="event_id" value={id}/>
          <label className="block space-y-2 font-semibold">
            <span>Why should Tikatero approve this free event?</span>
            <textarea name="reason" required minLength={10} maxLength={2000} defaultValue={request?.reason ?? ""}
              className="min-h-32 w-full rounded-xl border border-line p-3" placeholder="Describe the event, audience, and reason for free entry."/>
          </label>
          <button type="submit" className="rounded-xl bg-ink px-5 py-3 font-semibold text-white">Send for approval</button>
        </form>}
  </main>;
}
