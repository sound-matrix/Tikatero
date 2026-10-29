"use client";
import { useState, useTransition } from "react";
import { Turnstile } from "./turnstile";
import Script from "next/script";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { computePricing, type PricingVersion } from "@/lib/pricing/compute";
import { publicPrice } from "@/lib/discovery/model";
import { tierUnavailable, type CheckoutTier } from "@/lib/checkout/model";
import { submitCheckout } from "@/app/(public)/e/[slug]/checkout/actions";
export function CheckoutForm({
  slug,
  tiers,
  version,
  feePayer,
  isFree,
  siteKey,
  testMode,
  useCashfree,
  now,
}: {
  slug: string;
  tiers: CheckoutTier[];
  version: PricingVersion;
  feePayer: "buyer" | "organiser";
  isFree: boolean;
  siteKey: string;
  testMode: boolean;
  useCashfree: boolean;
  now: number;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [widgetGeneration, setWidgetGeneration] = useState(0);
  const router = useRouter();
  const lines = tiers.map((t) => ({
    id: t.id,
    price_paise: t.price_paise,
    qty: quantities[t.id] ?? 0,
  }));
  const { total } = computePricing({ lines, version, fee_payer: feePayer, is_free: isFree });
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const invalidShare = total.buyer_total > 0 && total.organiser_share <= 0;
  return (
    <form
      className="mt-8 grid gap-8 md:grid-cols-[1fr_22rem]"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        start(async () => {
          setError("");
          const result = await submitCheckout({
            slug,
            quotedTotal: total.buyer_total,
            pricingVersionId: version.id,
            name: form.get("name"),
            email: form.get("email"),
            phone: form.get("phone"),
            consent: form.get("consent") === "on",
            lines: lines.filter((l) => l.qty > 0).map(({ id, qty }) => ({ id, qty })),
            attendees: String(form.get("attendees") ?? "")
              .split("\n")
              .map((v) => v.trim())
              .filter(Boolean),
            turnstile: String(form.get("cf-turnstile-response") ?? ""),
          });
          if (result.payment && window.Cashfree) {
            try {
              const response = await window
                .Cashfree({ mode: result.payment.mode })
                .checkout({ paymentSessionId: result.payment.sessionId, redirectTarget: "_self" });
              if (response && typeof response === "object" && "error" in response && response.error)
                throw new Error();
              if (
                response &&
                typeof response === "object" &&
                "paymentDetails" in response &&
                response.paymentDetails &&
                result.url
              )
                router.push(result.url.replace(/\/pay$/, "/status"));
              return;
            } catch {
              /* The payment page provides a recoverable retry. */
            }
          }
          if (result.url) router.push(result.url);
          else {
            setError(result.error ?? "Please try again.");
            setWidgetGeneration((v) => v + 1);
          }
        });
      }}
    >
      {useCashfree && <Script src="https://sdk.cashfree.com/js/v3/cashfree.js" />}
      <div className="space-y-8">
        <section aria-labelledby="ticket-heading">
          <h2 id="ticket-heading" className="text-xl font-bold">
            Choose your tickets
          </h2>
          <div className="mt-4 divide-y divide-line rounded-2xl border border-line px-5">
            {tiers.map((tier) => {
              const reason = tierUnavailable(tier, now);
              const max = Math.min(tier.per_order_max ?? 50, tier.qty_total - tier.qty_sold, 50);
              return (
                <div key={tier.id} className="flex items-center justify-between gap-4 py-5">
                  <div>
                    <label htmlFor={`qty-${tier.id}`} className="font-bold">
                      {tier.name}
                    </label>
                    <p className="mt-1 text-sm text-muted">
                      {publicPrice(tier.price_paise, isFree)}
                    </p>
                    {reason && <p className="text-sm text-muted">{reason}</p>}
                    <p className="mt-1 text-xs text-muted">Up to {Math.max(max, 0)} per order</p>
                  </div>
                  <select
                    id={`qty-${tier.id}`}
                    aria-label={`${tier.name} quantity`}
                    disabled={!!reason || pending}
                    value={quantities[tier.id] ?? 0}
                    onChange={(e) =>
                      setQuantities({ ...quantities, [tier.id]: Number(e.target.value) })
                    }
                    className="min-h-12 rounded-xl border border-line bg-white px-4"
                  >
                    {Array.from({ length: Math.max(max, 0) + 1 }, (_, i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </section>
        <section aria-labelledby="details-heading">
          <h2 id="details-heading" className="text-xl font-bold">
            Your details
          </h2>
          <p className="mt-1 text-sm text-muted">Book without creating an account.</p>
          <div className="mt-5 space-y-4">
            <label className="block font-semibold">
              Full name
              <input
                required
                name="name"
                autoComplete="name"
                minLength={2}
                maxLength={120}
                className="mt-2 block min-h-12 w-full rounded-xl border border-line px-4"
              />
            </label>
            <div>
              <label htmlFor="buyer-email" className="block font-semibold">
                Email
              </label>
              <input
                id="buyer-email"
                required
                type="email"
                name="email"
                autoComplete="email"
                maxLength={254}
                aria-describedby="email-help"
                className="mt-2 block min-h-12 w-full rounded-xl border border-line px-4"
              />
              <p id="email-help" className="mt-1 text-sm text-muted">
                Tickets &amp; PDF go here
              </p>
            </div>
            <label className="block font-semibold">
              Phone
              <input
                required
                type="tel"
                name="phone"
                autoComplete="tel-national"
                inputMode="numeric"
                pattern="[6-9][0-9]{9}"
                maxLength={10}
                placeholder="10-digit Indian mobile number"
                className="mt-2 block min-h-12 w-full rounded-xl border border-line px-4"
              />
            </label>
            <label className="block font-semibold">
              Attendee names <span className="font-normal text-muted">(optional)</span>
              <textarea
                name="attendees"
                rows={3}
                maxLength={6000}
                placeholder="One name per line"
                className="mt-2 block w-full rounded-xl border border-line p-4"
              />
            </label>
          </div>
        </section>
      </div>
      <aside
        className="self-start rounded-2xl border border-line p-6 md:sticky md:top-6"
        aria-labelledby="summary-heading"
      >
        <h2 id="summary-heading" className="text-xl font-bold">
          Your booking
        </h2>
        {testMode && !isFree && (
          <p className="mt-4 rounded-xl bg-gold-soft p-3 font-bold text-gold-ink">
            Test mode — no real money
          </p>
        )}
        <dl className="mt-5 space-y-3 text-sm" aria-live="polite">
          <div className="flex justify-between gap-4">
            <dt>Tickets ({count})</dt>
            <dd>{publicPrice(total.subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Platform fee</dt>
            <dd>
              {publicPrice(feePayer === "buyer" ? total.platform_fee + total.platform_fee_gst : 0)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Payment fee</dt>
            <dd>{publicPrice(feePayer === "buyer" ? total.gateway_fee : 0)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-line pt-4 text-base font-extrabold">
            <dt>Total</dt>
            <dd>{publicPrice(total.buyer_total)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-muted">No hidden fees. What you see is what you pay.</p>
        <label className="mt-5 flex items-start gap-3 text-sm">
          <input required name="consent" type="checkbox" className="mt-1 h-5 w-5 shrink-0" />
          <span>
            I agree to the{" "}
            <Link className="underline" href="/legal/terms">
              terms
            </Link>
            ,{" "}
            <Link className="underline" href="/legal/privacy">
              privacy policy
            </Link>{" "}
            and this event’s refund policy.
          </span>
        </label>
        {siteKey && <Turnstile siteKey={siteKey} generation={widgetGeneration} />}
        {invalidShare && (
          <p role="alert" className="mt-4 text-sm text-danger">
            This ticket cannot be booked at its current price.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}
        <button
          disabled={pending || !count || invalidShare || count > 50}
          className="mt-5 min-h-13 w-full rounded-xl bg-linear-to-r from-coral to-orange px-5 py-3 font-extrabold text-ink disabled:opacity-50"
        >
          {pending
            ? "Holding your tickets…"
            : total.buyer_total === 0
              ? "Confirm RSVP"
              : `Pay ${publicPrice(total.buyer_total)}`}
        </button>
        {!isFree && (
          <p className="mt-4 text-center text-sm font-semibold text-teal">
            🔒 Secure payment by Cashfree
          </p>
        )}
        <p className="mt-3 text-center text-xs text-muted">
          Your seats are held for 10 minutes after you continue.
        </p>
      </aside>
    </form>
  );
}
