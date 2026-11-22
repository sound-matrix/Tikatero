import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { eventCity, eventCities, cityPath } from "@/lib/discovery/cities";
import { publicCityEvents } from "@/lib/discovery/data";
import { EventCard } from "@/components/discovery/event-card";
import { listingUrl } from "@/lib/discovery/model";
import { categories } from "@/lib/events/model";

type Props = { params: Promise<{ city: string }> };
const origin = "https://tikatero.com";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const city = eventCity((await params).city);
  if (!city) notFound();
  const events = await publicCityEvents(city.name);
  const indexable = events.length > 0;
  const title = `Events in ${city.name} | Tickets & Upcoming Events`;
  const description = `Discover upcoming events in ${city.name}. Explore concerts, workshops, festivals and more, and book tickets on Tikatero.`;
  const url = `${origin}${cityPath(city)}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { type: "website", title, description, url },
  };
}

async function CityEventsContent({ params }: Props) {
  await connection();
  const city = eventCity((await params).city);
  if (!city) notFound();
  const events = await publicCityEvents(city.name);
  const otherCities = eventCities.filter((option) => option.slug !== city.slug);
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <nav aria-label="Breadcrumb" className="mb-5 text-sm text-muted">
        <Link href="/" className="underline underline-offset-2">Home</Link>
        {" / "}
        <Link href="/events" className="underline underline-offset-2">Events</Link>
        {" / "}{city.name}
      </nav>
      <h1 className="text-3xl font-extrabold md:text-4xl">Upcoming events in {city.name}</h1>
      <p className="mt-4 max-w-3xl text-muted">
        Find concerts, comedy shows, workshops, festivals and other experiences in {city.name}.
        Browse public listings and book directly with the event organiser on Tikatero.
      </p>
      {events.length > 0 ? (
        <>
          <p className="mt-7 text-sm text-muted">
            Showing {events.length} upcoming {events.length === 1 ? "event" : "events"}
          </p>
          <section aria-label={`Upcoming events in ${city.name}`} className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => <EventCard key={event.id} event={event} />)}
          </section>
          <Link href={listingUrl({ city: city.name, country: "IN" })}
            className="mt-7 inline-block font-semibold text-teal underline underline-offset-4">
            Explore all events in {city.name}
          </Link>
        </>
      ) : (
        <section className="mt-8 rounded-2xl border border-line bg-soft p-6">
          <h2 className="text-xl font-bold">No public upcoming events listed yet</h2>
          <p className="mt-2 text-muted">
            There are currently no published upcoming events for {city.name}.
            Hidden and private events are never displayed here.
          </p>
          <Link href="/events" className="mt-4 inline-block font-semibold text-teal underline">
            Browse events across India
          </Link>
        </section>
      )}
      <section className="mt-10">
        <h2 className="text-xl font-bold">Explore events by category</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {categories.map((category) => (
            <Link key={category} href={listingUrl({ city: city.name, country: "IN", category })}
              className="rounded-full border border-line px-4 py-2 font-semibold hover:bg-soft">
              {category}
            </Link>
          ))}
        </div>
      </section>
      <section className="mt-10">
        <h2 className="text-xl font-bold">Explore other cities</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {otherCities.map((option) => (
            <Link key={option.slug} href={cityPath(option)}
              className="rounded-full border border-line px-4 py-2 font-semibold hover:bg-soft">
              {option.name}
            </Link>
          ))}
        </div>
      </section>
      <section className="mt-10 rounded-2xl bg-ink p-6 text-white">
        <h2 className="text-xl font-bold">Hosting an event in {city.name}?</h2>
        <p className="mt-2 text-white/90">Create your event listing and start sharing your ticket link.</p>
        <Link href="/console" className="mt-4 inline-block font-semibold underline underline-offset-4">
          Host an event
        </Link>
      </section>
    </main>
  );
}

export default function CityEventsPage(props: Props) {
  return (
    <Suspense fallback={<main className="mx-auto max-w-6xl p-8">Loading city events…</main>}>
      <CityEventsContent {...props} />
    </Suspense>
  );
}
