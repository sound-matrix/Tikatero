import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { eventSigningKey } from "@/lib/tickets/qr";
import { DEVICE_ID, EVENT_ID } from "./codes";
import { plainDatabaseError } from "./errors";
import type { OfflineTicket } from "./offline";

export const OFFLINE_PACK_MS = 12 * 60 * 60 * 1000;
const TICKET_PAGE = 1000;

export type OfflinePack = {
  eventId: string;
  title: string;
  expiresAt: string;
  key: string;
  tickets: OfflineTicket[];
};

async function inChunks<T>(ids: string[], load: (slice: string[]) => Promise<T[]>) {
  const rows: T[] = [];
  for (let index = 0; index < ids.length; index += 150) {
    rows.push(...(await load(ids.slice(index, index + 150))));
  }
  return rows;
}

export async function issueOfflinePack(input: {
  eventId: string;
  staffUserId: string;
  deviceId: string;
  now?: number;
}): Promise<{ pack?: OfflinePack; error?: string }> {
  if (!EVENT_ID.test(input.eventId) || !DEVICE_ID.test(input.deviceId))
    return { error: "This phone is not allowed to scan this event." };
  const client = createServiceClient();
  const { error: deviceError } = await client.rpc("authorise_scan_device", {
    p_event_id: input.eventId,
    p_user_id: input.staffUserId,
    p_device_id: input.deviceId,
  });
  if (deviceError)
    return {
      error: plainDatabaseError(deviceError, "Offline check-in isn't available for this phone."),
    };

  let key: Buffer;
  try {
    key = Buffer.from(eventSigningKey(input.eventId));
  } catch {
    return { error: "Offline check-in isn't available yet." };
  }

  const { data: event, error: eventError } = await client
    .from("events")
    .select("title")
    .eq("id", input.eventId)
    .maybeSingle();
  if (eventError || !event) return { error: "Offline check-in isn't available for this event." };

  const tickets: {
    code: string;
    holder_name: string | null;
    status: string;
    used_at: string | null;
    ticket_type_id: string;
    order_id: string;
  }[] = [];
  const seen = new Set<string>();
  for (let from = 0; ; from += TICKET_PAGE) {
    const { data, error } = await client
      .from("tickets")
      .select("code, holder_name, status, used_at, ticket_type_id, order_id")
      .eq("event_id", input.eventId)
      .order("code", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + TICKET_PAGE - 1);
    if (error || !data)
      return {
        error: "Offline check-in isn't available for this event. Stay online to scan.",
      };
    let added = 0;
    for (const row of data) {
      if (seen.has(row.code)) continue;
      seen.add(row.code);
      tickets.push(row);
      added += 1;
    }
    if (data.length < TICKET_PAGE) break;
    if (added === 0)
      return {
        error: "Offline check-in isn't available for this event. Stay online to scan.",
      };
  }

  const typeIds = [...new Set(tickets.map((ticket) => ticket.ticket_type_id))];
  const orderIds = [...new Set(tickets.map((ticket) => ticket.order_id))];
  let types: { id: string; name: string }[];
  let orders: { id: string; is_test: boolean }[];
  try {
    [types, orders] = await Promise.all([
      inChunks(typeIds, async (slice) => {
        const { data, error } = await client
          .from("ticket_types")
          .select("id, name")
          .in("id", slice);
        if (error || !data) throw new Error("ticket types");
        return data;
      }),
      inChunks(orderIds, async (slice) => {
        const { data, error } = await client.from("orders").select("id, is_test").in("id", slice);
        if (error || !data) throw new Error("orders");
        return data;
      }),
    ]);
  } catch {
    return { error: "Offline check-in isn't available for this event." };
  }

  const typeName = new Map(types.map((type) => [type.id, type.name]));
  const testOrder = new Map(orders.map((order) => [order.id, order.is_test]));
  const now = input.now ?? Date.now();
  return {
    pack: {
      eventId: input.eventId,
      title: event.title,
      expiresAt: new Date(now + OFFLINE_PACK_MS).toISOString(),
      key: key.toString("base64"),
      tickets: tickets.map((ticket) => ({
        code: ticket.code,
        holderName: ticket.holder_name?.trim() || "Guest",
        tier: typeName.get(ticket.ticket_type_id) || "Ticket",
        test: testOrder.get(ticket.order_id) === true,
        status: ticket.status,
        checkedInAt: ticket.status === "used" ? ticket.used_at : null,
      })),
    },
  };
}
