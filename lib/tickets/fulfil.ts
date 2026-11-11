import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { createServiceClient } from "@/lib/supabase/service";
import { emailSiteUrl } from "@/lib/email/templates";
import { send } from "@/lib/email/send";
import { privateStorageConfigured, putPrivatePdf } from "@/lib/storage";
import { signTicket, signTicketLink, ticketQrPng } from "./qr";
import { ticketFacts } from "./present";

const ENTITY = (orderId: string) => `order/${orderId}`;

function siteOrigin() {
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) throw new Error("Ticket links are not configured.");
  return emailSiteUrl(value, process.env.VERCEL_ENV !== "production").origin;
}

async function deliver(orderId: string) {
  const client = createServiceClient();
  const { data: order, error } = await client
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error("Tickets could not be prepared.");
  if (!order || order.status !== "paid") return;
  const [
    { data: tickets, error: ticketError },
    { data: event, error: eventError },
    { data: types, error: typeError },
  ] = await Promise.all([
    client.from("tickets").select("*").eq("order_id", orderId).order("seq"),
    client.from("events").select("*").eq("id", order.event_id).maybeSingle(),
    client
      .from("ticket_types")
      .select("id, name, is_vip, price_paise")
      .eq("event_id", order.event_id),
  ]);
  if (ticketError || eventError || typeError || !event || !event.starts_at) {
    throw new Error("Tickets could not be prepared.");
  }
  const rows = tickets ?? [];
  if (!rows.length) return;

  const origin = siteOrigin();
  const logoBytes = await readFile(
    path.join(process.cwd(), "public/brand/tikatero-email-logo.png"),
  );
  const logo = `data:image/png;base64,${logoBytes.toString("base64")}`;
  const { renderTicketPdf } = await import("./pdf");
  const attachments: { filename: string; content: Buffer; contentType: "application/pdf" }[] = [];
  const links: { label: string; href: string; path: string }[] = [];
  let vip = false;
  let bookingRef = "";

  for (const ticket of rows) {
    const tier = (types ?? []).find((item) => item.id === ticket.ticket_type_id);
    if (tier?.is_vip) vip = true;
    const facts = ticketFacts({
      code: ticket.code,
      seq: ticket.seq,
      total: rows.length,
      holderName: ticket.holder_name,
      buyerName: order.buyer_name,
      tierName: tier?.name ?? "Ticket",
      vip: tier?.is_vip ?? false,
      pricePaise: tier?.price_paise ?? 0,
      eventTitle: event.title,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      gatesOpenAt: event.gates_open_at,
      venueName: event.venue_name,
      address: event.address,
      city: event.city,
      mapsUrl: event.maps_url,
      lat: event.lat,
      lng: event.lng,
      isTest: order.is_test,
    });
    const payload = signTicket(ticket.code, event.id);
    const qr = await ticketQrPng(payload);
    const pdf = Buffer.from(
      await renderTicketPdf(facts, logo, `data:image/png;base64,${qr.toString("base64")}`),
    );
    const key = `tickets/${order.id}/${ticket.code}.pdf`;
    if (privateStorageConfigured()) {
      try {
        await putPrivatePdf(key, pdf);
      } catch {
        throw new Error("Ticket file could not be stored.");
      }
      const saved = await client.from("tickets").update({ pdf_key: key }).eq("id", ticket.id);
      if (saved.error) throw new Error("Ticket file could not be stored.");
    }
    attachments.push({
      filename: `${ticket.code}.pdf`,
      content: pdf,
      contentType: "application/pdf",
    });
    const link = signTicketLink(ticket.code);
    links.push({
      label: ticket.seq ? `Ticket ${ticket.seq} of ${rows.length}` : ticket.code,
      href: `${origin}${link.path}`,
      path: link.path,
    });
    bookingRef = ticket.code.slice(0, ticket.code.lastIndexOf("-"));
  }

  if (order.emailed_at) return;

  const entityRef = ENTITY(order.id);
  await client.rpc("release_failed_order_email", { p_entity_ref: entityRef });
  const venue =
    [event.venue_name, event.city].filter(Boolean).join(", ") || "Venue to be confirmed";
  const result = await send({
    template: "order_confirmed",
    to: order.buyer_email,
    entityRef,
    attachments,
    data: {
      recipientName: order.buyer_name,
      actionPath: links[0]?.path ?? "/me",
      event: { title: event.title, startsAt: event.starts_at, venue },
      orderRef: bookingRef || order.id,
      amountPaise: order.total_paise,
      vip,
      testBooking: order.is_test,
      tickets: links,
    },
  });

  const accepted = result.status === "sent" || result.status === "sent_unlogged";
  let duplicateAccepted = false;
  if (result.status === "duplicate") {
    const { data: log } = await client
      .from("email_log")
      .select("status")
      .eq("template", "order_confirmed")
      .eq("entity_ref", entityRef)
      .maybeSingle();
    duplicateAccepted = !!log && ["sent", "sending", "unknown"].includes(log.status);
  }
  if (result.status === "failed") {
    await client.rpc("release_failed_order_email", { p_entity_ref: entityRef });
  }
  if (!accepted && !duplicateAccepted) return;
  const stamped = await client
    .from("orders")
    .update({ emailed_at: new Date().toISOString() })
    .eq("id", order.id)
    .is("emailed_at", null);
  if (stamped.error) throw new Error("Tickets could not be prepared.");
}

export async function fulfilPaidOrder(orderId: string) {
  const client = createServiceClient();
  const { error } = await client.rpc("issue_tickets", { p_order_id: orderId });
  if (error) throw new Error("Tickets could not be issued.");
  await deliver(orderId);
}

export async function sweepTicketFulfilment() {
  const client = createServiceClient();
  const [{ data: pending, error: pendingError }, { data: unsent, error: unsentError }] =
    await Promise.all([
      client
        .from("order_outbox")
        .select("order_id")
        .eq("topic", "order.paid")
        .is("consumed_at", null)
        .order("created_at", { ascending: true })
        .limit(50),
      client
        .from("orders")
        .select("id")
        .eq("status", "paid")
        .is("emailed_at", null)
        .order("paid_at", { ascending: true })
        .limit(50),
    ]);
  if (pendingError || unsentError) throw new Error("Ticket sweep could not start.");
  const ids = [
    ...new Set([
      ...(pending ?? []).map((row) => row.order_id),
      ...(unsent ?? []).map((row) => row.id),
    ]),
  ];
  if (!ids.length) return { attempted: 0, failed: 0 };
  const { data: reviews, error: reviewError } = await client
    .from("order_outbox")
    .select("order_id")
    .eq("topic", "payment.review_required")
    .in("order_id", ids);
  if (reviewError) throw new Error("Ticket sweep could not start.");
  const blocked = new Set((reviews ?? []).map((row) => row.order_id));
  let failed = 0;
  const ready = ids.filter((id) => !blocked.has(id));
  for (const id of ready) {
    try {
      await fulfilPaidOrder(id);
    } catch {
      failed += 1;
    }
  }
  return { attempted: ready.length, failed };
}
