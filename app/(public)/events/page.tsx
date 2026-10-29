import { Suspense } from "react";
import Link from "next/link";
import { discover, PAGE_SIZE } from "@/lib/discovery/data";
import { locationFilters } from "@/lib/discovery/location";
import { listingUrl, type Search } from "@/lib/discovery/model";
import { DiscoveryFilters } from "@/components/discovery/filters";
import { EventCard } from "@/components/discovery/event-card";
import { LocationMemory } from "@/components/discovery/location-memory";
export const metadata = {
  title: "Find events",
  description:
    "Discover concerts, comedy, workshops and more. Find events by city, date and ticket price.",
};
async function Results({ searchParams }: { searchParams: Promise<Search> }) {
  const value = await locationFilters(await searchParams),
    result = await discover(value),
    pages = Math.ceil(result.total / PAGE_SIZE);
  return (
    <>
      <DiscoveryFilters value={value} />
      <LocationMemory city={value.city} country={value.country} />
      <p className="mb-5 mt-8 text-sm text-muted">
        {result.total} {result.total === 1 ? "event" : "events"} found · Times in IST
      </p>
      {result.events.length ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {result.events.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center">
          <h2 className="text-xl font-bold">
            {result.unavailable
              ? "Events are taking a little longer to load"
              : "No events here yet"}
          </h2>
          <p className="mt-2 text-muted">Try a different city, date or category.</p>
          <Link href="/events?city=&country=" className="mt-4 inline-block font-semibold underline">
            Clear filters
          </Link>
        </div>
      )}
      {pages > 1 && (
        <nav
          aria-label="Event result pages"
          className="mt-8 flex items-center justify-center gap-5"
        >
          {value.page > 1 && (
            <Link
              href={listingUrl({ ...value, page: value.page - 1 })}
              className="rounded-xl border border-line px-5 py-3"
            >
              Previous
            </Link>
          )}
          <span>
            Page {value.page} of {pages}
          </span>
          {value.page < pages && (
            <Link
              href={listingUrl({ ...value, page: value.page + 1 })}
              className="rounded-xl border border-line px-5 py-3"
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
export default function EventsPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <h1 className="mb-6 text-3xl font-extrabold">Find your next event</h1>
      <Suspense fallback={<p>Looking for events…</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
