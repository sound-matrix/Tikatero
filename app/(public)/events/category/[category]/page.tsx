import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { eventCategory, eventCategories, categoryPath } from "@/lib/discovery/categories";
import { publicCategoryEvents } from "@/lib/discovery/data";
import { EventCard } from "@/components/discovery/event-card";
import { listingUrl } from "@/lib/discovery/model";
import { eventCities, cityPath } from "@/lib/discovery/cities";

type Props = { params: Promise<{ category: string }> };
const origin = "https://tikatero.com";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const selected = eventCategory((await params).category);
  if (!selected) notFound();
  const events = await publicCategoryEvents(selected.category);
  const title = `${selected.label} in India | Upcoming Events & Tickets`;
  const description = `Explore upcoming ${selected.summary} across India. Find public events, compare ticket options and book on Tikatero.`;
  const url = `${origin}${categoryPath(selected)}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: events.length > 0, follow: true },
    openGraph: { type: "website", title, description, url },
  };
}

async function CategoryContent({ params }: Props) {
  await connection();
  const selected = eventCategory((await params).category);
  if (!selected) notFound();
  const events = await publicCategoryEvents(selected.category);
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <nav aria-label="Breadcrumb" className="mb-5 text-sm text-muted">
        <Link href="/" className="underline underline-offset-2">Home</Link>
        {" / "}
        <Link href="/events" className="underline underline-offset-2">Events</Link>
        {" / "}{selected.label}
      </nav>
      <h1 className="text-3xl font-extrabold md:text-4xl">Upcoming {selected.label.toLowerCase()} in India</h1>
      <p className="mt-4 max-w-3xl text-muted">
        Discover {selected.summary} across India. Browse upcoming public listings,
        review event information and book tickets through Tikatero.
      </p>
      {events.length ? (
        <>
          <p className="mt-7 text-sm text-muted">
            Showing {events.length} upcoming {events.length === 1 ? "event" : "events"}
          </p>
          <section aria-label={`Upcoming ${selected.label}`} className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => <EventCard key={event.id} event={event} />)}
          </section>
          <Link href={listingUrl({ category: selected.category, country: "IN" })}
            className="mt-7 inline-block font-semibold text-teal underline underline-offset-4">
            Browse all {selected.label.toLowerCase()}
          </Link>
        </>
      ) : (
        <section className="mt-8 rounded-2xl border border-line bg-soft p-6">
          <h2 className="text-xl font-bold">No public upcoming events listed yet</h2>
          <p className="mt-2 text-muted">
            There are currently no published upcoming {selected.label.toLowerCase()} on Tikatero.
            Hidden and private events do not appear here.
          </p>
          <Link href="/events" className="mt-4 inline-block font-semibold text-teal underline">
            Browse all events
          </Link>
        </section>
      )}
      <section className="mt-10">
        <h2 className="text-xl font-bold">Explore other event categories</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {eventCategories.filter((item) => item.slug !== selected.slug).map((item) => (
            <Link key={item.slug} href={categoryPath(item)}
              className="rounded-full border border-line px-4 py-2 font-semibold hover:bg-soft">
              {item.label}
            </Link>
          ))}
        </div>
      </section>
      <section className="mt-10">
        <h2 className="text-xl font-bold">Explore events by city</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {eventCities.map((city) => (
            <Link key={city.slug} href={cityPath(city)}
              className="rounded-full border border-line px-4 py-2 font-semibold hover:bg-soft">
              {city.name}
            </Link>
          ))}
        </div>
      </section>
      <section className="mt-10 rounded-2xl bg-ink p-6 text-white">
        <h2 className="text-xl font-bold">Organising {selected.label.toLowerCase()}?</h2>
        <p className="mt-2 text-white/90">Create an event listing and share your tickets with attendees.</p>
        <Link href="/console" className="mt-4 inline-block font-semibold underline underline-offset-4">
          Host an event
        </Link>
      </section>
    </main>
  );
}

export default function CategoryPage(props: Props) {
  return (
    <Suspense fallback={<main className="mx-auto max-w-6xl p-8">Loading category events…</main>}>
      <CategoryContent {...props} />
    </Suspense>
  );
}
