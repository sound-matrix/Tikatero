import Link from "next/link";
import { requireSocialAdmin } from "@/lib/admin/access";
import { Card } from "@/components/ui/card";
import { decidePromotion } from "./actions";

export default async function PromotionsAdmin() {
  const { client } = await requireSocialAdmin();
  const { data: campaigns, error } = await client.from("promotion_campaigns")
    .select("id,event_id,organiser_id,status,requested_at,approved_at")
    .order("requested_at", { ascending: false }).limit(100);
  if (error) throw new Error("Campaign review queue is unavailable.");
  const eventIds = (campaigns ?? []).map((c) => c.event_id);
  const { data: events, error: eventsError } = eventIds.length
    ? await client.from("events").select("id,title,slug,starts_at,status,hidden_at,is_unlisted").in("id", eventIds)
    : { data: [], error: null };
  if (eventsError) throw new Error("Event details are unavailable.");
  const eventsById = new Map((events ?? []).map((event) => [event.id, event]));
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-bold">Smart Promotions review</h1>
      <p className="text-muted">
        Only opted-in prior buyers of the same organiser can receive an approved email campaign.
        Approval queues at most 200 messages; it does not expose customer contacts to hosts.
        WhatsApp delivery is disabled.
      </p>
      {!campaigns?.length && <Card>No campaigns yet.</Card>}
      {campaigns?.map((campaign) => {
        const event = eventsById.get(campaign.event_id);
        return <Card key={campaign.id} className="space-y-3">
          <h2 className="text-xl font-semibold">{event?.title ?? "Event unavailable"}</h2>
          <p className="text-sm">Campaign: {campaign.status.replaceAll("_", " ")}</p>
          <p className="text-sm">Event: {event?.status ?? "unknown"} · {event?.starts_at ?? "unscheduled"}</p>
          <Link href={`/admin/events/${campaign.event_id}`} className="text-teal underline">
            Review event
          </Link>
          {campaign.status === "pending_review" && (
            <form action={decidePromotion} className="flex flex-wrap gap-3">
              <input type="hidden" name="event" value={campaign.event_id} />
              <button type="submit" name="decision" value="approve"
                className="min-h-11 rounded-lg border border-line px-4 font-semibold">
                Approve email campaign
              </button>
              <button type="submit" name="decision" value="reject"
                className="min-h-11 rounded-lg border border-line px-4 font-semibold">
                Reject
              </button>
            </form>
          )}
        </Card>;
      })}
    </main>
  );
}
