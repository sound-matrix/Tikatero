import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How to Sell Event Tickets Online in India | Organiser Guide",
  description: "A practical guide to planning event tickets, setting up prices, publishing an event page and sharing booking links in India.",
  alternates: { canonical: "https://tikatero.com/guides/sell-event-tickets-online" },
};

const sections = [
  {
    title: "1. Prepare the event details",
    paragraphs: [
      "Before opening ticket sales, confirm your event name, start and end times, venue address, organiser information and a clear description. Attendees should understand exactly what their ticket includes.",
      "Use a recognisable event poster that matches your event. Check the venue address and event time carefully before sharing the listing.",
    ],
  },
  {
    title: "2. Decide how your tickets will work",
    paragraphs: [
      "Choose whether admission is free or paid. For paid events, consider the total capacity, ticket prices, and whether a separate VIP or early-access ticket is needed.",
      "Publish clear admission and refund conditions. Your pricing should account for the applicable platform and payment charges shown in Tikatero's current pricing information.",
    ],
  },
  {
    title: "3. Build and review your event page",
    paragraphs: [
      "Open the Tikatero organiser console and follow the event-creation wizard. Add the event description, schedule, location, poster, guest information if relevant, and ticket types.",
      "Review the public-facing content before publishing. Make sure dates, venue details, prices, quantities and refund terms are consistent.",
    ],
  },
  {
    title: "4. Share the event booking link",
    paragraphs: [
      "After your event is published publicly, share the event page URL with your audience. Include it in social profiles, messages, email invitations and event announcements.",
      "Use a simple, consistent event title in your promotions. Explain the date, location, who the event is for and why attendees might want to come.",
      "If you have an organiser website, add a visible link to your published Tikatero event page. On the public event page, select Share event, then Copy website link code. Place that snippet on a relevant page you control. Never link a private event without permission.",
    ],
  },
  {
    title: "5. Manage bookings and event entry",
    paragraphs: [
      "Use the organiser console to review ticket activity and the available event-management tools. Prepare your entry team to verify attendees' tickets at the venue.",
      "If event details change, communicate clearly with ticket holders and review any cancellation or refund obligations.",
    ],
  },
] as const;

export default function SellTicketsGuide() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:px-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/" className="underline">Home</Link>{" / "}
        <Link href="/organisers" className="underline">Organisers</Link>{" / "} Ticket-selling guide
      </nav>
      <article>
        <header className="mt-7">
          <p className="text-sm font-bold uppercase tracking-wider text-muted">Event organiser guide</p>
          <h1 className="mt-3 text-3xl font-extrabold md:text-4xl">How to sell event tickets online in India</h1>
          <p className="mt-4 text-lg text-muted">
            A practical checklist for preparing your event, creating ticket types, publishing
            a listing and sharing the booking link with your audience.
          </p>
        </header>
        {sections.map(({ title, paragraphs }) => (
          <section key={title} className="mt-9">
            <h2 className="text-2xl font-bold">{title}</h2>
            {paragraphs.map((p) => <p key={p} className="mt-3 leading-7 text-muted">{p}</p>)}
          </section>
        ))}
        <section className="mt-10 rounded-2xl border border-line bg-soft p-6">
          <h2 className="text-xl font-bold">Before you go live</h2>
          <ul className="mt-4 list-inside list-disc space-y-2 text-muted">
            <li>Confirm the venue and event schedule.</li>
            <li>Review ticket quantities, prices and applicable fees.</li>
            <li>Make refund and admission terms clear to attendees.</li>
            <li>Test that the public event URL and ticket selection work.</li>
            <li>Prepare event entry and attendee communication.</li>
          </ul>
        </section>
      </article>
      <div className="mt-8 flex flex-wrap gap-5 font-semibold text-teal">
        <Link href="/organisers" className="underline">Explore Tikatero for organisers</Link>
        <Link href="/organisers/faq" className="underline">Organiser FAQs</Link>
        <Link href="/pricing" className="underline">Current pricing</Link>
      </div>
      <Link href="/login?as=host" className="mt-7 inline-flex min-h-12 items-center rounded-xl bg-ink px-6 font-bold text-white">
        Create your organiser account
      </Link>
    </main>
  );
}
