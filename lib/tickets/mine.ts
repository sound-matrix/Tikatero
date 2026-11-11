import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { formatIst } from "@/lib/format";
import { seatLabel, ticketStatusLabels } from "./present";

export type MyTicket = {
  code: string;
  eventTitle: string;
  startsAt: string;
  whenLabel: string;
  tierName: string;
  vip: boolean;
  seat: string;
  isTest: boolean;
  past: boolean;
  href: string;
  status: "valid" | "used" | "void" | "transferred" | "refunded";
  statusLabel: string;
  canEnter: boolean;
};

export async function loadMyTickets(buyerId: string): Promise<MyTicket[]> {
  const client = createServiceClient();
  const { data: orders, error } = await client
    .from("orders")
    .select("id, is_test, event_id")
    .eq("buyer_id", buyerId)
    .in("status", ["paid", "refunded", "partially_refunded"]);
  if (error) throw new Error("Your tickets could not be loaded.");
  if (!orders?.length) return [];
  const orderIds = orders.map((order) => order.id);
  const eventIds = [...new Set(orders.map((order) => order.event_id))];
  const [
    { data: tickets, error: ticketError },
    { data: events, error: eventError },
    { data: types, error: typeError },
  ] = await Promise.all([
    client.from("tickets").select("*").in("order_id", orderIds),
    client.from("events").select("id, title, starts_at, ends_at").in("id", eventIds),
    client.from("ticket_types").select("id, name, is_vip").in("event_id", eventIds),
  ]);
  if (ticketError || eventError || typeError) throw new Error("Your tickets could not be loaded.");
  const now = Date.now();
  const totals = new Map<string, number>();
  for (const ticket of tickets ?? [])
    totals.set(ticket.order_id, (totals.get(ticket.order_id) ?? 0) + 1);
  return (tickets ?? [])
    .map((ticket) => {
      const order = orders.find((item) => item.id === ticket.order_id);
      const event = events?.find((item) => item.id === ticket.event_id);
      const tier = types?.find((item) => item.id === ticket.ticket_type_id);
      if (!order || !event || !event.starts_at) return null;
      const ended = Date.parse(event.ends_at ?? event.starts_at) < now;
      return {
        code: ticket.code,
        eventTitle: event.title,
        startsAt: event.starts_at,
        whenLabel: formatIst(event.starts_at),
        tierName: tier?.name ?? "Ticket",
        vip: tier?.is_vip ?? false,
        seat: seatLabel(ticket.seq, totals.get(ticket.order_id) ?? 1),
        isTest: order.is_test,
        past: ended,
        href: `/t/${ticket.code}`,
        status: ticket.status,
        statusLabel: ticketStatusLabels[ticket.status] ?? ticket.status,
        canEnter: ticket.status === "valid" || ticket.status === "used",
      };
    })
    .filter((ticket): ticket is MyTicket => ticket !== null)
    .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
}
