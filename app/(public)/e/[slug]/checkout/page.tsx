import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requestTime } from "@/lib/discovery/data";
import { checkoutData } from "@/lib/checkout/store";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { formatIst } from "@/lib/format";
import { refundText } from "@/lib/discovery/model";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  if (!(await checkoutData((await params).slug))) notFound();
  return { title: "Checkout", robots: { index: false, follow: false } };
}
async function Checkout({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const now = await requestTime();
  const data = await checkoutData((await params).slug);
  if (!data) notFound();
  const { event, tiers, version, disabled, mode } = data;
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link className="text-sm font-semibold text-muted underline" href={`/e/${event.slug}`}>
        Back to event
      </Link>
      <h1 className="mt-5 text-3xl font-extrabold">{event.title}</h1>
      <p className="mt-2 text-muted">
        {event.starts_at ? formatIst(event.starts_at) : ""} · {event.venue_name}
      </p>
      <p className="mt-2 text-sm text-muted">{refundText(event.refund_policy)}</p>
      {disabled ? (
        <section className="mt-8 rounded-2xl border border-line p-8">
          <h2 className="text-xl font-bold">Booking unavailable</h2>
          <p className="mt-3 text-muted">{disabled}</p>
        </section>
      ) : (
        <CheckoutForm
          slug={event.slug}
          tiers={tiers}
          version={version}
          feePayer={event.fee_payer}
          isFree={event.is_free}
          siteKey={process.env.TURNSTILE_SITE_KEY ?? ""}
          useCashfree={mode === "cashfree"}
          testMode={mode === "mock" || process.env.CASHFREE_ENV !== "production"}
          now={now}
        />
      )}
    </main>
  );
}
export default function Page(props: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<p className="p-8">Loading checkout…</p>}>
      <Checkout {...props} />
    </Suspense>
  );
}
