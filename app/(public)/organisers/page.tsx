import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Host Events and Sell Tickets Online in India | Tikatero",
  description: "Your event. Your audience. Your success. Create listings, configure tickets, share booking links and manage bookings with Tikatero.",
  alternates: { canonical: "https://tikatero.com/organisers" },
  openGraph: {
    title: "Host Events and Sell Tickets Online in India | Tikatero",
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
          Your Event. Your Audience. Your Success.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Launch concerts, workshops, conferences and more with Tikatero. Set up your event,
          manage tickets and share a booking link with your audience — all in one organiser journey.
        </p>
        <div className="mt-6 flex flex-wrap gap-4">
          <Link href="/login?as=host" className="inline-flex min-h-12 items-center rounded-xl bg-ink px-6 font-bold text-white">Apply to host an event</Link>
          <Link href="/pricing" className="inline-flex min-h-12 items-center rounded-xl border border-line bg-white px-6 font-bold">View ticketing fees</Link>
        </div>
      </header>
      <section className="mt-12" aria-labelledby="organiser-benefits-heading">
        <h2 id="organiser-benefits-heading" className="text-3xl font-bold">Built around your event</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-line p-5"><h3 className="text-xl font-bold">Flexible ticket setup</h3><p className="mt-2 text-muted">Create free or paid ticket types, set capacities and configure pricing for your event.</p></div>
          <div className="rounded-2xl border border-line p-5"><h3 className="text-xl font-bold">One shareable booking link</h3><p className="mt-2 text-muted">Give your audience a dedicated event page to explore details and book tickets.</p></div>
          <div className="rounded-2xl border border-line p-5"><h3 className="text-xl font-bold">Manage bookings</h3><p className="mt-2 text-muted">Use your organiser console to track event registrations and access available check-in tools.</p></div>
        </div>
      </section>
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
          <Link href="/contact" className="underline">Talk to Tikatero about onboarding</Link>
        </div>
      </section>
      <section className="mt-12 rounded-2xl bg-ink p-6 text-white md:p-8">
        <h2 className="text-2xl font-bold">Ready to bring your audience together?</h2>
        <p className="mt-3 max-w-2xl text-white/90">Start your organiser application, or ask our team how Tikatero could support your upcoming event. Organiser approval is required before publishing.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/login?as=host" className="inline-flex min-h-12 items-center rounded-xl bg-white px-5 font-bold text-ink">Apply to host</Link>
          <Link href="/contact" className="inline-flex min-h-12 items-center rounded-xl border border-white/60 px-5 font-bold text-white">Contact our team</Link>
        </div>
      </section>
    </main>
  );
}
