import { Suspense } from "react";
import Link from "next/link";
import { discover } from "@/lib/discovery/data";
import { locationFilters } from "@/lib/discovery/location";
import { listingUrl, type Search } from "@/lib/discovery/model";
import { activePricing } from "@/lib/pricing/data";
import { organiserFeeWording } from "@/lib/pricing";
import { categories } from "@/lib/events/model";
import { DiscoveryFilters } from "@/components/discovery/filters";
import { EventCard } from "@/components/discovery/event-card";
import { LocationMemory } from "@/components/discovery/location-memory";
async function HomeContent({ searchParams }: { searchParams: Promise<Search> }) {
  const value = await locationFilters(await searchParams),
    result = await discover(value, true);
  return (
    <>
      <section className="rounded-3xl border border-line bg-[linear-gradient(130deg,#fff2eb,#ffffff_70%)] p-5 sm:p-9">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-muted">
          Your next great memory
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">
          Find events near you — or anywhere in the world
        </h1>
        <p className="mb-7 mt-4 max-w-xl text-lg text-muted">
          Big nights. New faces. Something just for you. Find your next experience with Tikatero.
        </p>
        <DiscoveryFilters value={value} compact />
        <LocationMemory city={value.city} country={value.country} />
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
async function FeeWording() {
  try {
    return organiserFeeWording(await activePricing());
  } catch {
    return "Pricing is temporarily unavailable. Please check again shortly.";
  }
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
              href={listingUrl({ category: c })}
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
      <section className="mt-10 flex flex-col gap-5 rounded-2xl bg-ink p-7 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Bring people together.</h2>
          <p className="mt-2 text-white/90">Create your event, your way.</p>
          <p className="mt-2 max-w-xl text-sm text-white/90">
            <Suspense fallback={<>Loading current fees…</>}>
              <FeeWording />
            </Suspense>
          </p>
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
