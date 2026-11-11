import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { createServiceClient } from "@/lib/supabase/service";
import { isTicketCode } from "./code";
import { ticketAccessAllowed } from "./access";
import { ticketFacts, type TicketFacts } from "./present";
import { signTicket, ticketQrPng, ticketQrSvg } from "./qr";

export type LoadedTicket = {
  facts: TicketFacts;
  orderId: string;
  pdfKey: string | null;
  qrPayload: string | null;
  admitted: boolean;
  ticketStatus: string;
};

type Row = {
  id: string;
  code: string;
  seq: number | null;
  holder_name: string | null;
  pdf_key: string | null;
  order_id: string;
  event_id: string;
  ticket_type_id: string;
};

const ticketOrderStatuses = ["paid", "partially_refunded", "refunded"] as const;

async function orderBundle(orderId: string, statuses: readonly string[] = ticketOrderStatuses) {
  const client = createServiceClient();
  const { data: order, error } = await client
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error("Your ticket could not be loaded.");
  if (!order || !statuses.includes(order.status)) return null;
  const [
    { data: tickets, error: ticketError },
    { data: event, error: eventError },
    { data: types, error: typeError },
  ] = await Promise.all([
    client.from("tickets").select("*").eq("order_id", orderId).order("seq"),
    client.from("events").select("*").eq("id", order.event_id).maybeSingle(),
    client.from("ticket_types").select("*").eq("event_id", order.event_id),
  ]);
  if (ticketError || eventError || typeError || !event || !event.starts_at) {
    throw new Error("Your ticket could not be loaded.");
  }
  return { order, event, tickets: tickets ?? [], types: types ?? [] };
}

function factsFor(
  ticket: Row,
  bundle: NonNullable<Awaited<ReturnType<typeof orderBundle>>>,
): TicketFacts {
  const tier = bundle.types.find((item) => item.id === ticket.ticket_type_id);
  const startsAt = bundle.event.starts_at;
  if (!startsAt) throw new Error("Your ticket could not be loaded.");
  return ticketFacts({
    code: ticket.code,
    seq: ticket.seq,
    total: bundle.tickets.length,
    holderName: ticket.holder_name,
    buyerName: bundle.order.buyer_name,
    tierName: tier?.name ?? "Ticket",
    vip: tier?.is_vip ?? false,
    pricePaise: tier?.price_paise ?? 0,
    eventTitle: bundle.event.title,
    startsAt,
    endsAt: bundle.event.ends_at,
    gatesOpenAt: bundle.event.gates_open_at,
    venueName: bundle.event.venue_name,
    address: bundle.event.address,
    city: bundle.event.city,
    mapsUrl: bundle.event.maps_url,
    lat: bundle.event.lat,
    lng: bundle.event.lng,
    isTest: bundle.order.is_test,
  });
}

export async function loadTicket(code: string, token?: string): Promise<LoadedTicket | null> {
  const normalized = code.trim().toUpperCase();
  if (!isTicketCode(normalized)) return null;
  const client = createServiceClient();
  const { data: ticket, error } = await client
    .from("tickets")
    .select("*")
    .eq("code", normalized)
    .maybeSingle();
  if (error) throw new Error("Your ticket could not be loaded.");
  if (!ticket) return null;
  const bundle = await orderBundle(ticket.order_id);
  if (!bundle) return null;
  const allowed = await ticketAccessAllowed({
    code: ticket.code,
    token,
    orderId: bundle.order.id,
    buyerId: bundle.order.buyer_id,
    accessTokenHash: bundle.order.access_token_hash,
  });
  if (!allowed) return null;
  const admitted = ticket.status === "valid" || ticket.status === "used";
  let qrPayload: string | null = null;
  if (admitted) {
    try {
      qrPayload = signTicket(ticket.code, ticket.event_id);
    } catch {
      qrPayload = null;
    }
  }
  return {
    facts: factsFor(ticket, bundle),
    orderId: bundle.order.id,
    pdfKey: ticket.pdf_key,
    qrPayload,
    admitted,
    ticketStatus: ticket.status,
  };
}

export async function loadOrderTickets(orderId: string) {
  const bundle = await orderBundle(orderId);
  if (!bundle) return [];
  return bundle.tickets
    .slice()
    .sort((left, right) => (left.seq ?? 0) - (right.seq ?? 0))
    .map((ticket) => ({
      href: `/t/${ticket.code}`,
      label: ticket.seq ? `Ticket ${ticket.seq} of ${bundle.tickets.length}` : ticket.code,
    }));
}

export async function loadTicketPdf(code: string, token?: string) {
  const loaded = await loadTicket(code, token);
  if (!loaded?.admitted) return null;
  const bundle = await orderBundle(loaded.orderId);
  if (!bundle || !loaded.qrPayload) return { loaded, pdf: null as Buffer | null };
  const [logoBytes, qr] = await Promise.all([
    readFile(path.join(process.cwd(), "public/brand/tikatero-email-logo.png")),
    ticketQrPng(loaded.qrPayload),
  ]);
  const { renderTicketPdf } = await import("./pdf");
  const pdf = await renderTicketPdf(
    loaded.facts,
    `data:image/png;base64,${logoBytes.toString("base64")}`,
    `data:image/png;base64,${qr.toString("base64")}`,
  );
  return { loaded, pdf: Buffer.from(pdf) };
}

export async function ticketSvg(payload: string) {
  return ticketQrSvg(payload);
}
