import { Suspense } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { alternates: { canonical: "https://tikatero.com/" } };
import Link from "next/link";
import Image from "next/image";
import { discover } from "@/lib/discovery/data";
import { locationFilters } from "@/lib/discovery/location";
import { listingUrl, type Search } from "@/lib/discovery/model";
import { categories } from "@/lib/events/model";
import { categoryByName, categoryPath } from "@/lib/discovery/categories";
import { eventCities, cityPath } from "@/lib/discovery/cities";
import { DiscoveryFilters } from "@/components/discovery/filters";
import { EventCard } from "@/components/discovery/event-card";
import { LocationMemory } from "@/components/discovery/location-memory";
async function HomeContent({ searchParams }: { searchParams: Promise<Search> }) {
  const value = await locationFilters(await searchParams),
    result = await discover(value, true);
  return (
    <>
      <section className="rounded-3xl border border-line bg-[linear-gradient(130deg,#fff2eb,#ffffff_70%)] p-5 sm:p-9">
        <div className="grid items-center gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:gap-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-muted">
              Your next great memory
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">
              Find events near you — or anywhere in the world
            </h1>
            <p className="mt-4 max-w-xl text-lg text-muted">
              Big nights. New faces. Something just for you. Find your next experience with Tikatero.
            </p>
          </div>
          <div className="mx-auto w-full max-w-[260px] sm:max-w-[320px] lg:max-w-[360px]">
            <div className="overflow-hidden rounded-2xl border border-[#f3c9ad]/70 bg-[#fff3e9] shadow-sm">
              <picture>
                <source
                  media="(min-width: 640px) and (prefers-reduced-motion: no-preference)"
                  srcSet="/animations/tikatero-welcome-entry.gif"
                  type="image/gif"
                />
                <Image
                  src="/animations/tikatero-welcome-poster.png"
                  alt="A guest approaches the Welcome Tikatero venue entrance with a QR ticket."
                  width={357}
                  height={358}
                  loading="eager"
                  fetchPriority="high"
                  sizes="(max-width: 640px) 260px, 320px"
                  quality={75}
                  className="h-auto w-full"
                />
              </picture>
            </div>
          </div>
        </div>
        <div className="mt-6">
        <DiscoveryFilters value={value} compact />
        <LocationMemory city={value.city} country={value.country} />
        </div>
      </section>
      <section className="mt-10">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">Trending now</h2>
            <p className="mt-1 text-sm text-muted">
              Popular by tickets sold. The newest events come next.
            </p>
          </div>
          <Link
            href={listingUrl(value)}
            className="shrink-0 font-semibold underline underline-offset-4"
          >
            See all events
          </Link>
        </div>
        {result.events.length ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {result.events.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line p-10 text-center">
            <h3 className="text-xl font-bold">
              {result.unavailable
                ? "Events are taking a little longer to load"
                : "No events here yet"}
            </h3>
            <p className="mt-2 text-muted">
              {result.unavailable
                ? "Please try again in a moment."
                : "Try another city, or check back soon for something new."}
            </p>
            <Link
              href="/events?city=&country="
              className="mt-4 inline-block font-semibold underline"
            >
              Explore all events
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
export default function HomePage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
      <Suspense fallback={<p className="py-10">Finding your next experience…</p>}>
        <HomeContent searchParams={searchParams} />
      </Suspense>
      <section className="mt-10">
        <h2 className="text-2xl font-bold">What are you in the mood for?</h2>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {categories.map((c, i) => (
            <Link
              key={c}
              href={categoryByName(c) ? categoryPath(categoryByName(c)!) : listingUrl({ category: c })}
              className="rounded-2xl border border-line p-5 font-bold hover:bg-soft"
            >
              <span aria-hidden="true" className="mb-3 block text-2xl">
                {["♫", "✦", "◎", "☺", "✎", "⚑", "♡", "✧"][i]}
              </span>
              {c}
            </Link>
          ))}
        </div>
      </section>
      <section className="mt-10">
        <h2 className="text-2xl font-bold">Explore events by city</h2>
        <div className="mt-5 flex flex-wrap gap-3">
          {eventCities.map((city) => (
            <Link key={city.slug} href={cityPath(city)}
              className="rounded-full border border-line px-4 py-2 font-semibold hover:bg-soft">
              {city.name}
            </Link>
          ))}
        </div>
      </section>
      <section className="mt-10 flex flex-col gap-5 rounded-2xl bg-ink p-7 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Bring people together.</h2>
          <p className="mt-2 text-white/90">Create your event, your way. Get started with ticket types, pricing and a booking link.</p>
          <Link href="/organisers" className="mt-3 inline-block font-semibold text-white underline underline-offset-4">How event hosting works</Link>
        </div>
        <Link
          href="/console"
          className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--coral),var(--orange))] px-5 text-xl font-bold text-ink"
        >
          Host an event
        </Link>
      </section>
    </main>
  );
}
