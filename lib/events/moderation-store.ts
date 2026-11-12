import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { PUBLIC_BUCKET } from "@/lib/storage";
import { createServiceClient } from "@/lib/supabase/service";

type Client = SupabaseClient<Database>;

export async function latestRemovalRequest(client: Client, eventId: string) {
  const { data, error } = await client
    .from("event_removal_requests")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .order("id")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("The removal request could not be loaded.");
  return data;
}

export async function loadModerationEvent(client: Client, eventId: string) {
  const { data, error } = await client
    .from("events")
    .select(
      "id,title,slug,organiser_id,status,starts_at,ends_at,gates_open_at,venue_name,address,city,country,poster_key,theme,capacity,hidden_at,hidden_reason,hidden_by_staff",
    )
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error("The event could not be loaded.");
  return data;
}

export async function loadAdminEventReview(eventId: string, client: Client) {
  const service = createServiceClient();
  const event = await loadModerationEvent(service, eventId);
  if (!event) return null;
  const [host, tickets, bookings, history, request, summary] = await Promise.all([
    service
      .from("organisers")
      .select("display_name,kyc_status")
      .eq("id", event.organiser_id)
      .single(),
    service
      .from("ticket_types")
      .select("id,name,qty_sold,qty_total,price_paise")
      .eq("event_id", eventId)
      .order("sort"),
    service.from("orders").select("id", { count: "exact", head: true }).eq("event_id", eventId),
    client
      .from("audit_log")
      .select("id,action,reason,created_at")
      .eq("entity", "events")
      .eq("entity_id", eventId)
      .order("created_at", { ascending: false })
      .limit(50),
    latestRemovalRequest(client, eventId),
    client.rpc("admin_event_review_list", {
      p_search: "",
      p_status: "",
      p_filter: "",
      p_offset: 0,
      p_event_id: eventId,
    }),
  ]);
  if (host.error || tickets.error || bookings.error || history.error || summary.error)
    throw new Error("The event review could not be loaded.");
  return {
    event,
    host: host.data,
    tickets: tickets.data,
    hasOrders: (bookings.count ?? 0) > 0,
    history: history.data,
    grossPaise: summary.data[0]?.gross_paise ?? 0,
    request,
  };
}

/** The DB commits a cleanup entry with deletion; Storage owns the physical files. */
export async function cleanDeletedEventMedia(eventId: string) {
  const service = createServiceClient();
  const { data, error } = await service
    .from("event_media_cleanup")
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return;
  const bucket = service.storage.from(PUBLIC_BUCKET);
  for (const kind of ["poster", "guest_photo"]) {
    const prefix = `media/${kind}/${eventId}`;
    while (true) {
      const files = await bucket.list(prefix, { limit: 100 });
      if (files.error) throw files.error;
      if (!files.data.length) break;
      const removed = await bucket.remove(files.data.map((file) => `${prefix}/${file.name}`));
      if (removed.error) throw removed.error;
    }
  }
  const removed = await service.from("event_media_cleanup").delete().eq("event_id", eventId);
  if (removed.error) throw removed.error;
}

export async function sweepDeletedEventMedia() {
  const { data, error } = await createServiceClient()
    .from("event_media_cleanup")
    .select("event_id")
    .order("created_at")
    .limit(10);
  if (error) throw error;
  const results = await Promise.allSettled(
    data.map(({ event_id }) => cleanDeletedEventMedia(event_id)),
  );
  return results.filter((result) => result.status === "rejected").length;
}
