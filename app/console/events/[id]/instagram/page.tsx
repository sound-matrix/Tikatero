import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccount } from "@/lib/auth/account";
import { InstagramTicketSales } from "@/components/console/instagram-ticket-sales";

export const metadata: Metadata = { title: "Instagram Ticket Sales" };

async function InstagramEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const { client, account } = await requireAccount();
  if (!account.organisers.length) notFound();
  const { data: event, error } = await client
    .from("events")
    .select("id,organiser_id,slug,title,city,status,hidden_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !event || !account.organisers.some((org) => org.id === event.organiser_id)) notFound();
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-8">
      <header>
        <p className="mb-2 text-sm font-bold uppercase tracking-widest text-teal">Grow your ticket sales</p>
        <h1 className="text-3xl font-extrabold">Instagram Ticket Sales</h1>
        <p className="mt-2 text-muted">{event.title}</p>
        <Link className="mt-3 inline-block font-semibold text-teal underline" href="/console/tools/instagram">
          Choose a different event
        </Link>
      </header>
      {event.status === "published" && !event.hidden_at ? (
        <InstagramTicketSales client={client} event={event} />
      ) : (
        <section className="rounded-2xl border border-line p-6">
          <h2 className="text-xl font-bold">Publish your event to enable Instagram sales.</h2>
          <p className="mt-2 text-muted">Booking links are available for published, visible events only.</p>
          <Link className="mt-4 inline-block font-semibold text-teal underline" href={`/console/events/${id}/edit`}>
            Edit event
          </Link>
        </section>
      )}
    </main>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="p-8">Loading Instagram ticket tools…</p>}>
      <InstagramEvent params={params} />
    </Suspense>
  );
}
