import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requestTime } from "@/lib/discovery/data";
import { ownOrder } from "@/lib/checkout/security";
import { publicPrice } from "@/lib/discovery/model";
import { formatIst } from "@/lib/format";
import { CashfreeCheckout } from "@/components/checkout/cashfree-checkout";
import { payuPaymentForm } from "@/lib/payments/payu";
import { providerOrder } from "@/lib/checkout/store";
import { mockPayment } from "./actions";
import { mockConfirmationAllowed } from "@/lib/payments/model";
export const metadata = { title: "Payment", robots: { index: false, follow: false } };
async function Payment({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await ownOrder(id);
  const now = await requestTime();
  if (!order) notFound();
  if (order.status !== "pending" || Date.parse(order.hold_expires_at ?? "") <= now)
    redirect(`/orders/${id}/status`);
  return (
    <main className="mx-auto max-w-lg px-4 py-14">
      <h1 className="text-3xl font-extrabold">
        {order.payment_provider === "mock" ? "Test payment" : "Complete your payment"}
      </h1>
      <p className="mt-4 text-xl font-bold">{publicPrice(order.total_paise)}</p>
      <p className="mt-2 text-sm text-muted">
        Seats held until {formatIst(order.hold_expires_at!)}
      </p>
      {order.payment_provider === "mock" ? (
        <>
          <p className="mt-6 rounded-xl bg-gold-soft p-4 font-bold text-gold-ink">
            Test mode — no real money
          </p>
          {!mockConfirmationAllowed(process.env) && (
            <p className="mt-4 text-muted">Test success is disabled in production.</p>
          )}
          <form action={mockPayment.bind(null, id, "paid")}>
            <button
              disabled={!mockConfirmationAllowed(process.env)}
              className="mt-6 min-h-12 w-full rounded-xl bg-linear-to-r from-coral to-orange px-5 font-bold disabled:opacity-50"
            >
              Success
            </button>
          </form>
          <form action={mockPayment.bind(null, id, "failed")}>
            <button className="mt-3 min-h-12 w-full rounded-xl border border-line px-5 font-bold">
              Fail
            </button>
          </form>
        </>
      ) : order.payment_provider === "payu" && order.payment_session_id ? (
        <PayUForm order={providerOrder(order)} />
      ) : order.payment_session_id ? (
        <CashfreeCheckout
          sessionId={order.payment_session_id}
          statusUrl={`/orders/${id}/status`}
          mode={process.env.CASHFREE_ENV === "production" ? "production" : "sandbox"}
        />
      ) : (
        <p className="mt-6 text-muted">
          Your payment session is being checked. Please check your order status.
        </p>
      )}
      <Link className="mt-6 inline-block underline" href={`/orders/${id}/status`}>
        Check order status
      </Link>
    </main>
  );
}
function PayUForm({ order }: { order: ReturnType<typeof providerOrder> }) {
  const siteOrigin = process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.tikatero.com").origin;
  const { action, fields } = payuPaymentForm(order, siteOrigin);
  return (
    <form action={action} method="POST" className="mt-6">
      {Object.entries(fields).map(([name,value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <button type="submit" className="min-h-12 w-full rounded-xl bg-linear-to-r from-coral to-orange px-5 py-3 font-bold">Continue securely to PayU</button>
      <p className="mt-4 text-sm font-semibold text-teal">🔒 Secure payment by PayU</p>
    </form>
  );
}
export default function Page(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="p-8">Loading payment…</p>}>
      <Payment {...props} />
    </Suspense>
  );
}
