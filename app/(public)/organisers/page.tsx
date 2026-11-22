import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sell Event Tickets Online in India",
  description: "Create an event, set ticket types and prices, share your booking link, and manage bookings with Tikatero's organiser console.",
  alternates: { canonical: "https://tikatero.com/organisers" },
  openGraph: {
    title: "Sell Event Tickets Online in India | Tikatero",
    description: "Create event listings, sell tickets and manage attendees on Tikatero.",
    url: "https://tikatero.com/organisers",
  },
};

const steps = [
  { title: "Set up your organiser account", detail: "Sign in, add your organiser information and complete the approval steps shown in the console." },
  { title: "Create your event", detail: "Add an event title, category, date, venue, description and poster." },
  { title: "Configure tickets", detail: "Set free or paid ticket types, prices, capacities and refund terms." },
  { title: "Publish and share", detail: "After your event is eligible for publication, share its unique public booking link with your audience." },
  { title: "Manage attendance", detail: "Track tickets and use the organiser's available booking and check-in tools." },
] as const;

export default function OrganiserLandingPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 md:px-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/" className="underline">Home</Link> {" / "} For organisers
      </nav>
      <header className="mt-8 rounded-3xl border border-line bg-[linear-gradient(130deg,#fff2eb,#fff)] p-6 md:p-10">
        <p className="text-sm font-bold uppercase tracking-wider text-muted">For event organisers in India</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-tight md:text-5xl">
          Sell event tickets online with Tikatero
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Organise concerts, workshops, conferences and more. Create your event page,
          configure ticket types and share a booking link with attendees.
        </p>
        <div className="mt-6 flex flex-wrap gap-4">
          <Link href="/login?as=host" className="inline-flex min-h-12 items-center rounded-xl bg-ink px-6 font-bold text-white">Get started as an organiser</Link>
          <Link href="/pricing" className="inline-flex min-h-12 items-center rounded-xl border border-line bg-white px-6 font-bold">See current pricing</Link>
        </div>
      </header>
      <section className="mt-12">
        <h2 className="text-3xl font-bold">How it works</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-2">
          {steps.map((step, i) => (
            <li key={step.title} className="rounded-2xl border border-line p-5">
              <p className="text-sm font-bold text-teal">Step {i + 1}</p>
              <h3 className="mt-2 text-xl font-bold">{step.title}</h3>
              <p className="mt-2 text-muted">{step.detail}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="mt-12 rounded-2xl bg-soft p-6">
        <h2 className="text-2xl font-bold">Understand fees before publishing</h2>
        <p className="mt-3 text-muted">
          Ticket prices and applicable charges are shown during setup. Fees and payout
          information depend on the current pricing settings and event configuration.
          Review the live pricing page rather than relying on a fixed advertised rate.
        </p>
        <Link href="/pricing" className="mt-4 inline-block font-semibold text-teal underline">
          Review ticketing fees and payout terms
        </Link>
      </section>
      <section className="mt-12">
        <h2 className="text-2xl font-bold">Planning your first event?</h2>
        <p className="mt-3 text-muted">Use our practical organiser guide to prepare your event information and ticket setup.</p>
        <div className="mt-5 flex flex-wrap gap-5 font-semibold text-teal">
          <Link href="/guides/sell-event-tickets-online" className="underline">Read the ticket-selling guide</Link>
          <Link href="/organisers/faq" className="underline">Organiser questions and answers</Link>
          <Link href="/contact" className="underline">Contact Tikatero</Link>
        </div>
      </section>
    </main>
  );
}
