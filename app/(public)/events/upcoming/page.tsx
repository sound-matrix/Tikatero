import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";
import Link from "next/link";
import { EventMedia } from "@/components/discovery/media";
import { Button } from "@/components/ui/button";
import { upcomingEvents } from "@/lib/discovery/data";
import { socialPriceLabel } from "@/lib/social/caption";
import { siteOrigin } from "@/lib/discovery/seo";
import { formatIst } from "@/lib/format";
import { istDay } from "@/lib/social/window";
import { instagramTicketUrl } from "@/lib/sharing/instagram";

export const metadata: Metadata = {
  title: "Upcoming events",
  alternates: { canonical: "/events/upcoming" },
};

function titleLink(bookUrl: string, slug: string) {
  const url = new URL(bookUrl);
  url.pathname = `/e/${slug}`;
  return url.toString();
}

async function UpcomingList() {
  await io();
  const origin = await siteOrigin();
  const events = await upcomingEvents(istDay(new Date()));
  return events.length ? (
    <ul className="mt-6 space-y-5">
      {events.map((event) => {
        const book = instagramTicketUrl(origin, event.slug, "bio");
        return (
          <li key={event.id} className="border-b border-line pb-5">
            <Link href={titleLink(book, event.slug)} className="grid grid-cols-[7rem_1fr] gap-3">
              <EventMedia
                title={event.title}
                posterKey={event.poster_key}
                theme={event.theme}
                compact
              />
              <span>
                <h2 className="block text-lg font-extrabold leading-snug">{event.title}</h2>
                <span className="mt-1 block text-sm text-muted">{formatIst(event.starts_at)}</span>
                {event.city ? <span className="mt-1 block text-sm">{event.city}</span> : null}
                <span className="mt-2 block font-bold">{socialPriceLabel(event)}</span>
              </span>
            </Link>
            <Button href={book} variant="primary" className="mt-3 w-full">
              Book
            </Button>
          </li>
        );
      })}
    </ul>
  ) : (
    <div className="mt-8 rounded-2xl border border-dashed border-line p-6 text-center">
      <p className="text-lg font-bold">No upcoming events right now. Check back soon.</p>
      <Link href="/events" className="mt-3 inline-block font-semibold text-teal underline">
        Browse events
      </Link>
    </div>
  );
}

export default function UpcomingEventsPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <h1 className="text-3xl font-extrabold">Upcoming events on Tikatero</h1>
      <p className="mt-2">
        <a
          className="font-semibold text-teal underline"
          href="https://www.instagram.com/tikatero_official"
          rel="noopener noreferrer"
        >
          Follow @tikatero_official
        </a>
      </p>
      <Suspense fallback={<p className="mt-8">Loading upcoming events…</p>}>
        <UpcomingList />
      </Suspense>
    </main>
  );
}
