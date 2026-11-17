import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { requireAccount } from "@/lib/auth/account";
import { siteOrigin } from "@/lib/discovery/seo";
import { formatIst } from "@/lib/format";
import { ShareEventCard } from "@/components/console/share-event";
import { InstagramTicketSales } from "@/components/console/instagram-ticket-sales";
import { MarketingPoster } from "@/components/console/marketing-poster";

export const metadata: Metadata = { title: "Event Marketing Kit" };

export default async function EventMarketing({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { client, account } = await requireAccount();
  if (!account.organisers.length) notFound();
  const { data: event, error } = await client.from("events")
    .select("id,organiser_id,slug,title,city,starts_at,status,hidden_at")
    .eq("id", id).maybeSingle();
  if (error || !event || !account.organisers.some((org) => org.id === event.organiser_id)) notFound();
  const published = event.status === "published" && !event.hidden_at;
  const url = published ? `${await siteOrigin()}/e/${event.slug}` : "";
  const qr = published ? await QRCode.toDataURL(url, { width: 512, margin: 3 }) : "";
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-8">
      <header>
        <p className="text-sm font-bold uppercase tracking-widest text-teal">Host marketing</p>
        <h1 className="mt-2 text-3xl font-extrabold">Event Marketing Kit</h1>
        <p className="mt-2 text-muted">{event.title}</p>
        <Link href="/console/tools/marketing" className="mt-3 inline-block font-semibold text-teal underline">Choose another event</Link>
      </header>
      {published ? (
        <>
          <MarketingPoster slug={event.slug} title={event.title}
            date={event.starts_at ? formatIst(event.starts_at) : "See event for details"}
            city={event.city} url={url} qr={qr} />
          <ShareEventCard client={client} event={event} />
          <InstagramTicketSales client={client} event={event} />
        </>
      ) : (
        <section className="rounded-2xl border border-line p-6">
          <h2 className="text-xl font-bold">Publish your event to unlock its marketing kit</h2>
          <p className="mt-2 text-muted">Links, QR posters and promotional artwork are available for published, visible events.</p>
          <Link href={`/console/events/${id}/edit`} className="mt-3 inline-block font-semibold text-teal underline">Edit event</Link>
        </section>
      )}
    </main>
  );
}
