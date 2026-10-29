"use client";
import { useActionState, useState } from "react";
import { savePricing } from "@/app/admin/pricing/actions";
import {
  decimalHundredths,
  organiserFeeWording,
  previewPricing,
  type PricingVersion,
} from "@/lib/pricing";
import { parseSettings } from "@/lib/pricing/settings";
import { formatInr } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export function PricingForm({ initial }: { initial: PricingVersion }) {
  const [state, action, pending] = useActionState(savePricing, {});
  const active = state.version ?? initial;
  const [fields, setFields] = useState({
    platform_pct: decimalHundredths(initial.platform_pct),
    fixed_fee: decimalHundredths(initial.fixed_fee_paise),
    gateway_mode: initial.gateway_mode,
    gateway_pct: decimalHundredths(initial.gateway_bps),
    payout_days: String(initial.payout_days),
  });
  const [feePayer, setFeePayer] = useState<"organiser" | "buyer">("organiser");
  let draft: PricingVersion | null = null;
  let previewError = "";
  try {
    draft = parseSettings(fields, active);
  } catch (error) {
    previewError = error instanceof Error ? error.message : "Check the values.";
  }
  const update = (key: keyof typeof fields, value: string) =>
    setFields((prior) => ({ ...prior, [key]: value }));
  return (
    <div className="space-y-6">
      <section
        className="rounded-2xl border border-line bg-white p-5"
        aria-label="Active pricing version"
      >
        <h2 className="text-xl font-bold">Active version</h2>
        <p className="mt-2 text-sm text-muted break-all" data-testid="active-pricing-id">
          {active.id}
        </p>
        <p className="mt-3">{organiserFeeWording(active)}</p>
        <p className="mt-2 font-semibold text-teal">Payout after {active.payout_days} days.</p>
      </section>
      <form action={action} className="space-y-6">
        <fieldset
          disabled={pending}
          className="grid gap-5 rounded-2xl border border-line p-5 md:grid-cols-2"
        >
          <legend className="px-2 text-xl font-bold">New pricing version</legend>
          <Input
            label="Platform fee (%)"
            name="platform_pct"
            inputMode="decimal"
            value={fields.platform_pct}
            onChange={(e) => update("platform_pct", e.target.value)}
            required
          />
          <Input
            label="Fixed fee per paid ticket (₹)"
            name="fixed_fee"
            inputMode="decimal"
            value={fields.fixed_fee}
            onChange={(e) => update("fixed_fee", e.target.value)}
            required
          />
          <label className="font-semibold">
            Gateway mode
            <select
              name="gateway_mode"
              value={fields.gateway_mode}
              onChange={(e) => update("gateway_mode", e.target.value)}
              className="mt-1.5 min-h-12 w-full rounded-xl border border-line bg-white px-3"
            >
              <option value="pass_at_cost">Pass at cost</option>
              <option value="absorb">Absorb</option>
            </select>
          </label>
          <Input
            label="Gateway fee (%) before GST"
            name="gateway_pct"
            inputMode="decimal"
            value={fields.gateway_pct}
            onChange={(e) => update("gateway_pct", e.target.value)}
            required
          />
          <Input
            label="Payout days"
            name="payout_days"
            inputMode="numeric"
            value={fields.payout_days}
            onChange={(e) => update("payout_days", e.target.value)}
            required
          />
        </fieldset>
        <section
          className="rounded-2xl border border-line bg-soft p-5"
          aria-label="Live pricing preview"
        >
          <h2 className="text-xl font-bold">Live preview</h2>
          <label className="mt-3 block font-semibold">
            Who pays the fees?
            <select
              value={feePayer}
              onChange={(e) => setFeePayer(e.target.value as typeof feePayer)}
              className="ml-3 min-h-12 rounded-xl border border-line bg-white px-3"
            >
              <option value="organiser">Organiser absorbs</option>
              <option value="buyer">Pass to buyer</option>
            </select>
          </label>
          {draft ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Amounts include GST. All fees are rounded per ticket.
                </caption>
                <thead>
                  <tr>
                    {[
                      "Ticket incl. GST",
                      "Platform + GST",
                      "Gateway incl. GST",
                      "Buyer total incl. GST",
                      "Organiser receives",
                    ].map((label) => (
                      <th key={label} className="p-3">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[29900, 100000, 499900].map((price) => {
                    const p = previewPricing({ ticketPaise: price, feePayer }, draft!);
                    return (
                      <tr
                        key={price}
                        data-testid={`pricing-preview-${price}`}
                        className="border-t border-line"
                      >
                        {[
                          price,
                          p.platformFeePaise + p.feeGstPaise,
                          p.gatewayFeePaise,
                          p.buyerTotalPaise,
                          p.organiserPayoutPaise,
                        ].map((value, i) => (
                          <td
                            key={i}
                            className={`whitespace-nowrap p-3 ${i === 4 ? "font-bold text-teal" : ""}`}
                          >
                            {formatInr(value).replace("₹", "₹ ")}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-danger" role="alert">
              {previewError}
            </p>
          )}
        </section>
        <p className="text-sm text-muted">
          Saving creates an audited version. Existing orders keep their original fees.
        </p>
        {state.error && (
          <p role="alert" className="text-danger">
            {state.error}
          </p>
        )}
        {state.success && (
          <p role="status" className="font-semibold text-teal">
            {state.success}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={pending || !draft}>
          {pending ? "Saving…" : "Save — applies to new orders"}
        </Button>
      </form>
    </div>
  );
}
