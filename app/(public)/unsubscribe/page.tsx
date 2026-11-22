import { Suspense } from "react";
import { stopPromotionEmails } from "./actions";
export const metadata = { title: "Unsubscribe from event promotions", robots: { index: false, follow: false } };
async function UnsubscribeContent({ searchParams }: {
  searchParams: Promise<{ token?: string; done?: string }>
}) {
  const { token, done } = await searchParams;
  return <main className="mx-auto max-w-lg space-y-5 px-6 py-14">
    <h1 className="text-3xl font-bold">Event promotion preferences</h1>
    {done === "1" ? (
      <p>Your promotional email opt-in has been turned off. Booking receipts remain unaffected.</p>
    ) : typeof token === "string" && token.length <= 120 ? (
      <>
        <p>Stop optional emails about future events from organisers you previously booked.</p>
        <form action={stopPromotionEmails}>
          <input type="hidden" name="token" value={token} />
          <button type="submit" className="min-h-12 rounded-xl border border-line px-5 font-bold">
            Unsubscribe from promotion emails
          </button>
        </form>
      </>
    ) : (
      <p>This link is missing or invalid. You can also adjust promotion preferences in Your account.</p>
    )}
  </main>;
}

export default function Unsubscribe({ searchParams }: {
  searchParams: Promise<{ token?: string; done?: string }>
}) {
  return <Suspense fallback={<main className="mx-auto max-w-lg px-6 py-14">
    Loading email preferences…
  </main>}>
    <UnsubscribeContent searchParams={searchParams} />
  </Suspense>;
}
