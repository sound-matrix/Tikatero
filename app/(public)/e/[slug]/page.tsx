import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";
import { publicEvent, requestTime } from "@/lib/discovery/data";
import { publicPrice, refundText, tierState, jsonLdString } from "@/lib/discovery/model";
import { eventJsonLd, siteOrigin } from "@/lib/discovery/seo";
import { formatIst } from "@/lib/format";
import { openMaps } from "@/lib/events/model";
import { EventMedia, mediaUrl } from "@/components/discovery/media";
import { ShareButton } from "@/components/discovery/share-button";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const e = await publicEvent((await params).slug);
  if (!e) notFound();
  const origin = await siteOrigin(),
    url = `${origin}/e/${e.slug}`,
    description = (
      e.description ?? `${e.title} at ${e.venue_name ?? e.city ?? "the venue"}.`
    ).slice(0, 160);
  return {
    title: e.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      title: e.title,
      description,
      url,
      images: [{ url: `${url}/opengraph-image`, width: 1200, height: 630, alt: e.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: e.title,
      description,
      images: [`${url}/opengraph-image`],
    },
  };
}
async function Detail({ params }: Props) {
  await connection();
  const e = await publicEvent((await params).slug);
  if (!e) notFound();
  const now = await requestTime(),
    end = e.ends_at ?? e.starts_at,
    available = e.tiers.some((t) => tierState(t, end, now) === "Available"),
    origin = await siteOrigin();
  const maps = openMaps({
    lat: e.lat === null ? "" : String(e.lat),
    lng: e.lng === null ? "" : String(e.lng),
    mapsUrl: e.maps_url ?? "",
    venue: e.venue_name ?? "",
    address: e.address ?? "",
    city: e.city ?? "",
  });
  const bookClass =
    "inline-flex min-h-12 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--coral),var(--orange))] px-7 py-3 font-bold text-ink";
  const book = available ? (
    <Link href={`/e/${e.slug}/book`} className={bookClass}>
      {e.is_free ? "RSVP" : "Book"}
    </Link>
  ) : (
    <button disabled className="min-h-12 rounded-xl bg-soft px-7 font-bold text-muted">
      {Date.parse(end) <= now
        ? "Event ended"
        : e.tiers.length && e.tiers.every((t) => t.qty_sold >= t.qty_total)
          ? "Sold out"
          : "Booking not available yet"}
    </button>
  );
  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:px-6 md:pb-12">
      <Link
        href="/events"
        className="mb-5 inline-block text-sm font-semibold underline underline-offset-4"
      >
        ← Explore events
      </Link>
      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <EventMedia title={e.title} posterKey={e.poster_key} theme={e.theme} priority />
          <p className="mt-6 text-sm font-bold uppercase tracking-wider text-muted">
            {e.category ?? "Event"} · {e.city ?? e.country}
          </p>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight md:text-4xl">{e.title}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="text-muted">
              By <strong className="text-ink">{e.organiser_name}</strong>
            </p>
            {e.verified && (
              <span className="rounded-full bg-teal-soft px-3 py-1 text-sm font-bold text-[#087570]">
                ✓ Verified organiser
              </span>
            )}
          </div>
          <div className="mt-6 grid gap-4 rounded-2xl border border-line p-5 sm:grid-cols-2">
            <div>
              <h2 className="font-bold">When</h2>
              <p className="mt-2">{formatIst(e.starts_at)}</p>
              {e.ends_at && <p className="mt-1 text-sm text-muted">Ends {formatIst(e.ends_at)}</p>}
              {e.gates_open_at && (
                <p className="mt-2 text-sm text-muted">Gates open {formatIst(e.gates_open_at)}</p>
              )}
            </div>
            <div>
              <h2 className="font-bold">Where</h2>
              <p className="mt-2">{e.venue_name}</p>
              <p className="mt-1 text-sm text-muted">
                {[e.address, e.city, e.country].filter(Boolean).join(", ")}
              </p>
              <a
                href={maps}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block font-semibold underline underline-offset-4"
              >
                Open in Maps ↗
              </a>
            </div>
          </div>
          <section className="mt-8">
            <h2 className="text-2xl font-bold">About this event</h2>
            <p className="mt-3 whitespace-pre-wrap leading-relaxed text-muted">
              {e.description ||
                "Come along and enjoy the experience. The organiser will share more details soon."}
            </p>
          </section>
          {e.guests.length > 0 && (
            <section className="mt-8">
              <h2 className="text-2xl font-bold">VIPs & chief guests</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {e.guests.map((g, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 rounded-2xl border border-gold/40 bg-gold-soft p-5"
                  >
                    {mediaUrl(g.photo_key) ? (
                      <Image
                        src={mediaUrl(g.photo_key)!}
                        width={64}
                        height={64}
                        alt={g.name}
                        className="h-16 w-16 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-2xl text-gold-ink"
                      >
                        ✦
                      </span>
                    )}
                    <div>
                      {g.is_vip && (
                        <p className="text-xs font-bold uppercase tracking-widest text-gold-ink">
                          Special guest
                        </p>
                      )}
                      <h3 className="font-bold">{g.name}</h3>
                      <p className="text-sm text-muted">{g.title}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          {e.lat !== null && e.lng !== null && (
            <section className="mt-8">
              <h2 className="text-2xl font-bold">Find the venue</h2>
              <details className="mt-4 rounded-2xl border border-line p-4">
                <summary className="min-h-10 cursor-pointer font-semibold">Show venue map</summary>
                <iframe
                  title={`Map of ${e.venue_name ?? "the venue"}`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="mt-3 h-72 w-full rounded-xl border-0"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${e.lng - 0.01}%2C${e.lat - 0.008}%2C${e.lng + 0.01}%2C${e.lat + 0.008}&layer=mapnik&marker=${e.lat}%2C${e.lng}`}
                />
                <p className="mt-2 text-xs text-muted">
                  Map data ©{" "}
                  <a href="https://www.openstreetmap.org/copyright" className="underline">
                    OpenStreetMap contributors
                  </a>
                </p>
              </details>
            </section>
          )}
          <section className="mt-8 rounded-2xl bg-soft p-5">
            <h2 className="font-bold">Refund policy</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{refundText(e.refund_policy)}</p>
          </section>
        </div>
        <aside
          aria-label="Tickets"
          className="rounded-2xl border border-line bg-white p-5 lg:sticky lg:top-28"
        >
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-2xl font-bold">
              {e.is_free ? "Free — RSVP" : "Choose your ticket"}
            </h2>
          </div>
          <p className="mt-2 text-sm text-muted">
            {e.is_free ? "Reserve your place with an RSVP." : "Ticket prices include GST."}
          </p>
          <div className="mt-5 space-y-3">
            {e.tiers.map((t) => {
              const state = tierState(t, end, now);
              return (
                <div
                  key={t.id}
                  className={`rounded-xl border p-4 ${t.is_vip ? "border-gold/50 bg-gold-soft" : "border-line"}`}
                >
                  <div className="flex justify-between gap-2">
                    <h3 className="font-bold">{t.name}</h3>
                    {t.is_vip && <span className="text-xs font-bold text-gold-ink">VIP</span>}
                  </div>
                  <p className="mt-2 font-bold">{publicPrice(t.price_paise, e.is_free)}</p>
                  <p className="mt-1 text-sm text-muted">
                    {state}
                    {state === "Not on sale yet" && t.sales_start
                      ? ` · ${formatIst(t.sales_start)}`
                      : ""}
                  </p>
                  {state === "Available" ? (
                    <Link
                      className="mt-3 inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
                      href={`/e/${e.slug}/book?tier=${encodeURIComponent(t.id)}`}
                    >
                      {e.is_free ? "RSVP" : "Book"} · {t.name}
                    </Link>
                  ) : (
                    <button disabled className="mt-3 min-h-11 text-sm font-semibold text-muted">
                      {state}
                    </button>
                  )}
                </div>
              );
            })}
            {!e.tiers.length && (
              <p className="rounded-xl bg-soft p-4 text-sm text-muted">
                Ticket details are coming soon.
              </p>
            )}
          </div>
          <div className="mt-5 hidden md:block">{book}</div>
          <p className="my-5 text-xs text-muted">
            Booking opens soon. No payment is collected yet.
          </p>
          <ShareButton title={e.title} />
        </aside>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-line bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden">
        <p className="text-sm font-bold">
          {e.is_free ? "Free — RSVP" : publicPrice(e.min_price_paise)}
        </p>
        {book}
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(eventJsonLd(e, origin, now)) }}
      />
    </main>
  );
}
export default function EventPage(props: Props) {
  return (
    <Suspense fallback={<main className="mx-auto max-w-6xl p-8">Loading event…</main>}>
      <Detail {...props} />
    </Suspense>
  );
}
