import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Organiser FAQs | Ticket Sales, Publishing & Payouts",
  description: "Answers to common Tikatero organiser questions about event setup, ticket prices, publishing, attendee check-in and payouts.",
  alternates: { canonical: "https://tikatero.com/organisers/faq" },
};

const questions = [
  {
    question: "How do I start selling event tickets on Tikatero?",
    answer: "Create an organiser account, complete any required verification, set up your event in the organiser console, choose ticket types and submit it for publication as applicable.",
  },
  {
    question: "Can I host free events?",
    answer: "Tikatero supports free event tickets. Free-event hosting may have eligibility or usage restrictions, so review the organiser console or contact support before planning multiple free events.",
  },
  {
    question: "Can I sell different kinds of tickets?",
    answer: "Yes. The event wizard supports multiple ticket types, prices, quantities and optional VIP ticket settings.",
  },
  {
    question: "How are ticketing fees calculated?",
    answer: "Ticket prices and applicable platform or payment fees depend on your current event settings. The pricing page shows current fee information and examples, with GST included where indicated.",
  },
  {
    question: "How can I promote my event?",
    answer: "After publication, share your public event URL with attendees. Tikatero's event page includes sharing options such as WhatsApp, Facebook and link copying.",
  },
  {
    question: "When will I receive my event earnings?",
    answer: "Payout timing and any holds depend on your event and Tikatero's current payout settings. Check the live pricing page and your organiser earnings screen for applicable information.",
  },
  {
    question: "Can I manage cancellations and refunds?",
    answer: "You can set an event refund policy and review refund requests through the organiser tools. Ticket buyers see the applicable rules before booking.",
  },
  {
    question: "Why is my event not appearing on Google?",
    answer: "Draft, hidden and private events are not intended for public discovery. Even for a published event, Google decides whether and when to index it; appearing in a sitemap does not guarantee search visibility.",
  },
] as const;

export default function OrganiserFaqPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:px-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/" className="underline">Home</Link>{" / "}
        <Link href="/organisers" className="underline">Organisers</Link>{" / "} FAQs
      </nav>
      <h1 className="mt-7 text-3xl font-extrabold md:text-4xl">Frequently asked questions for event organisers</h1>
      <p className="mt-4 text-muted">Practical answers for listing events and managing ticket sales on Tikatero.</p>
      <div className="mt-8 space-y-4">
        {questions.map(({ question, answer }) => (
          <section key={question} className="rounded-2xl border border-line p-5">
            <h2 className="text-lg font-bold">{question}</h2>
            <p className="mt-3 leading-7 text-muted">{answer}</p>
          </section>
        ))}
      </div>
      <p className="mt-8 text-muted">
        For current fees and payout terms, consult <Link href="/pricing" className="font-semibold text-teal underline">Tikatero pricing</Link>.
        For help with your event, <Link href="/contact" className="font-semibold text-teal underline">contact support</Link>.
      </p>
      <Link href="/login?as=host" className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-ink px-6 font-bold text-white">
        Start hosting on Tikatero
      </Link>
    </main>
  );
}
