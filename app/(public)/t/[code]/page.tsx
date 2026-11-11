import { cache, Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { TicketOffline } from "@/components/tickets/ticket-offline";
import { BRIGHTNESS_HINT, TICKET_TERMS, seatLabel, ticketEntryNotice } from "@/lib/tickets/present";
import { loadTicket, ticketSvg } from "@/lib/tickets/load";

const ticketForRequest = cache(async (code: string, token?: string) => {
  await connection();
  return loadTicket(code, token);
});

function tokenFrom(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function Ticket({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const token = tokenFrom(query.t);
  const ticket = await ticketForRequest(code, token);
  if (!ticket) notFound();
  const suffix = token ? `?t=${encodeURIComponent(token)}` : "";
  const svg = ticket.qrPayload ? await ticketSvg(ticket.qrPayload) : null;
  const { facts } = ticket;
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      <TicketOffline />
      {facts.isTest && (
        <p className="mb-4 rounded-xl bg-gold-soft p-4 text-center text-lg font-extrabold text-gold-ink">
          TEST TICKET
        </p>
      )}
      <article className="rounded-3xl border border-line bg-white p-5 shadow-sm">
        {ticket.admitted ? (
          <p className="text-sm font-bold tracking-wide text-teal">Show this QR at the door</p>
        ) : (
          <p className="rounded-xl bg-soft p-4 text-center font-bold text-ink">
            {ticketEntryNotice(ticket.ticketStatus)}
          </p>
        )}
        <h1 className="mt-3 text-3xl font-extrabold text-ink">{facts.eventTitle}</h1>
        <p className="mt-3 text-lg">{facts.whenLabel}</p>
        <p className="mt-1 text-muted">{facts.gatesLabel}</p>
        <p className="mt-4 font-semibold">{facts.venueName}</p>
        {facts.addressLabel && <p className="text-muted">{facts.addressLabel}</p>}
        <p
          className={facts.vip ? "mt-4 text-lg font-bold text-gold-ink" : "mt-4 text-lg font-bold"}
        >
          {facts.tierName}
          {facts.vip ? " · VIP" : ""} · {facts.priceLabel}
        </p>
        <p className="mt-2 text-lg">{facts.holderName}</p>
        <p className="text-muted">{seatLabel(facts.seq, facts.total)}</p>
        <p className="mt-4 font-mono text-xl font-bold tracking-wide">{facts.code}</p>
        {ticket.admitted && svg ? (
          // Inline SVG stays inside the cached page, so the QR still shows offline.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={`QR code for ${facts.code}`}
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
            className="mx-auto mt-6 h-72 w-72 max-w-full"
          />
        ) : ticket.admitted ? (
          <p className="mt-6 rounded-xl bg-soft p-4 text-center">
            This ticket can’t be displayed yet. Please try again soon.
          </p>
        ) : null}
        {ticket.admitted && (
          <>
            <p className="mt-4 text-center text-muted">{BRIGHTNESS_HINT}</p>
            <p className="mt-3 text-center text-sm text-muted">{TICKET_TERMS}</p>
          </>
        )}
      </article>
      {ticket.admitted && (
        <div className="mt-5 grid gap-3">
          <Button href={`/t/${facts.code}/pdf${suffix}`} variant="primary">
            Download PDF
          </Button>
          {facts.mapsUrl && (
            <Button href={facts.mapsUrl} target="_blank" rel="noopener noreferrer">
              Open in Maps
            </Button>
          )}
          <Button href={`/t/${facts.code}/calendar${suffix}`}>Add to calendar</Button>
        </div>
      )}
    </main>
  );
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ t?: string | string[] }>;
}): Promise<Metadata> {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const ticket = await ticketForRequest(code, tokenFrom(query.t));
  if (!ticket) notFound();
  return { title: "Your ticket", robots: { index: false, follow: false } };
}

export default function Page(props: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  return (
    <Suspense fallback={<p className="p-8">Loading…</p>}>
      <Ticket {...props} />
    </Suspense>
  );
}
