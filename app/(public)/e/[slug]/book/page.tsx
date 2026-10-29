import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { publicEvent } from "@/lib/discovery/data";
export const metadata = { title: "Booking opens soon", robots: { index: false, follow: false } };
async function Booking({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const e = await publicEvent((await params).slug);
  if (!e) notFound();
  return (
    <main className="mx-auto max-w-xl px-4 py-20 text-center">
      <p className="text-sm font-bold text-muted">{e.title}</p>
      <h1 className="mt-4 text-4xl font-extrabold">Booking opens soon</h1>
      <p className="mt-4 text-muted">
        We’re getting things ready. Come back soon to {e.is_free ? "RSVP" : "book your tickets"}.
      </p>
      <Link
        href={`/e/${e.slug}`}
        className="mt-7 inline-flex min-h-12 items-center rounded-xl border border-line px-5 font-bold"
      >
        Back to event
      </Link>
    </main>
  );
}
export default function BookPage(props: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<p className="p-8">Loading event…</p>}>
      <Booking {...props} />
    </Suspense>
  );
}
