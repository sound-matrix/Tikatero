import { Suspense } from "react";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/format";
import { organiserFeeWording, previewPricing, type PricingVersion } from "@/lib/pricing";
import { publicPayoutHoldDays } from "@/lib/payments/settings";
import { earningsPaymentCopy } from "@/lib/payouts/earnings";
import { activePricing } from "@/lib/pricing/data";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Tikatero pricing in Indian rupees, including GST.",
};

const examplePrices = [50_000, 100_000, 250_000] as const;

function StartSelling() {
  return (
    <Button href="/console" variant="primary" className="mt-8 w-full sm:w-auto">
      Start selling tickets
    </Button>
  );
}

function ExampleTable({ version }: { version: PricingVersion }) {
  const rows = examplePrices.map((ticketPaise) => ({
    ticketPaise,
    quote: previewPricing({ ticketPaise, feePayer: "organiser" }, version),
  }));
  const lines = (quote: (typeof rows)[number]["quote"]) =>
    [
      ["Tikatero fee", quote.platformFeePaise],
      ["GST on the fee", quote.feeGstPaise],
      ["Payment gateway (incl. GST)", quote.gatewayFeePaise],
      ["You receive", quote.organiserPayoutPaise],
    ] as const;
  return (
    <>
      <p className="mt-5 text-base leading-7 text-ink">
        What you receive when you pay the fees. Every amount includes GST.
      </p>
      <div className="mt-4 space-y-3 md:hidden">
        {rows.map((row) => (
          <article key={row.ticketPaise} className="rounded-2xl border border-line p-4">
            <h3 className="text-lg font-bold">{formatInr(row.quote.ticketPaise)} incl. GST</h3>
            <dl className="mt-3 space-y-2 text-sm">
              {lines(row.quote).map(([label, paise]) => (
                <div key={label} className="flex items-baseline justify-between gap-4">
                  <dt className={label === "You receive" ? "font-semibold" : "text-muted"}>
                    {label}
                  </dt>
                  <dd className="font-semibold">{formatInr(paise)}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
      <div className="mt-4 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">
            What you receive when you pay the fees. Every amount includes GST.
          </caption>
          <thead className="bg-soft text-muted">
            <tr>
              {[
                "Ticket price (incl. GST)",
                "Tikatero fee",
                "GST on the fee",
                "Payment gateway (incl. GST)",
                "You receive",
              ].map((heading) => (
                <th key={heading} scope="col" className="p-3 font-semibold">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.ticketPaise} className="border-t border-line">
                <td className="p-3 font-semibold">{formatInr(row.quote.ticketPaise)}</td>
                <td className="p-3">{formatInr(row.quote.platformFeePaise)}</td>
                <td className="p-3">{formatInr(row.quote.feeGstPaise)}</td>
                <td className="p-3">{formatInr(row.quote.gatewayFeePaise)}</td>
                <td className="p-3 font-semibold">{formatInr(row.quote.organiserPayoutPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

async function PricingDetails() {
  let version: PricingVersion;
  let days: number;
  try {
    [version, days] = await Promise.all([activePricing(), publicPayoutHoldDays()]);
  } catch {
    return (
      <>
        <p className="mt-6 text-ink">
          Pricing is temporarily unavailable. Please check again shortly.
        </p>
        <StartSelling />
      </>
    );
  }
  return (
    <>
      <section className="mt-8">
        <h2 className="text-2xl font-bold text-ink">For people buying tickets</h2>
        <p className="mt-3 text-base leading-7 text-ink">
          Ticket prices include GST. What you see is what you pay.
        </p>
      </section>
      <section className="mt-8">
        <h2 className="text-2xl font-bold text-ink">For organisers</h2>
        <p className="mt-3 text-base leading-7 text-ink">Free events cost nothing.</p>
        <p className="mt-3 text-base leading-7 text-ink">{organiserFeeWording(version)}</p>
        <ExampleTable version={version} />
      </section>
      <section className="mt-8">
        <h2 className="text-2xl font-bold text-ink">When organisers get paid</h2>
        <p className="mt-3 text-base leading-7 text-ink">{earningsPaymentCopy(days)}</p>
      </section>
      <StartSelling />
    </>
  );
}

export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Pricing</h1>
      <p className="mt-4 text-base leading-7 text-ink">
        Prices are in Indian rupees (₹) and include GST.
      </p>
      <Suspense fallback={<p className="mt-6">Loading pricing…</p>}>
        <PricingDetails />
      </Suspense>
    </main>
  );
}
