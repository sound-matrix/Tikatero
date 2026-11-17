import type { SupabaseClient } from "@supabase/supabase-js";
import { Card } from "@/components/ui/card";
import { siteOrigin } from "@/lib/discovery/seo";
import type { Database } from "@/lib/db/types";
import { InstagramTicketSalesClient } from "./instagram-ticket-sales-client";

type Event = { id: string; slug: string; title: string; city: string | null };

export async function InstagramTicketSales({
  client, event,
}: { client: SupabaseClient<Database>; event: Event }) {
  const [origin, stats] = await Promise.all([
    siteOrigin(),
    client.rpc("event_share_stats", { p_event_id: event.id }),
  ]);
  const instagram = stats.data?.find((entry) => entry.channel === "instagram");
  return (
    <Card>
      <h2 className="text-xl font-bold">Instagram Ticket Sales</h2>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {([
          ["Tracked visits", instagram?.visits ?? 0],
          ["Ticket bookings", instagram?.bookings ?? 0],
          ["Shared links", instagram?.shares ?? 0],
        ] as const).map(([label, value]) => (
          <div key={label} className="rounded-xl bg-soft p-3">
            <p className="text-2xl font-extrabold">{stats.error ? "—" : value}</p>
            <p className="mt-1 text-xs text-muted">{label}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 mb-5 text-xs text-muted">
        Instagram figures combine Story, bio and ad traffic; paid bookings are attributed by
        referral channel, not Instagram's native advertising reports.
      </p>
      <InstagramTicketSalesClient origin={origin} slug={event.slug} title={event.title} city={event.city} />
    </Card>
  );
}
