import { formatInr } from "@/lib/format";
import { computePricing, type PricingVersion } from "./compute";
export { computePricing, type PricingVersion } from "./compute";
/** Used only for unconfigured local previews. Configured deployments read the database. */
export const launchPricing: PricingVersion = {
  id: "00000000-0000-4000-8000-000000000010",
  platform_pct: 150,
  fixed_fee_paise: 500,
  gst_bps: 1800,
  gateway_mode: "pass_at_cost",
  gateway_bps: 195,
  payout_days: 2,
};
export type FeePreviewInput = {
  ticketPaise: number;
  feePayer: "organiser" | "buyer";
  free?: boolean;
};
export function previewPricing(
  { ticketPaise, feePayer, free = false }: FeePreviewInput,
  version: PricingVersion,
) {
  const { total } = computePricing({
    lines: [{ price_paise: ticketPaise, qty: 1 }],
    version,
    fee_payer: feePayer,
    is_free: free,
  });
  return {
    ticketPaise: total.subtotal,
    platformFeePaise: total.platform_fee,
    feeGstPaise: total.platform_fee_gst,
    gatewayFeePaise: total.gateway_fee,
    buyerTotalPaise: total.buyer_total,
    organiserPayoutPaise: total.organiser_share,
  };
}
/** Also used to format percentage form values, without floating-point conversion. */
export function decimalHundredths(value: number) {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}
export function rateText(bps: number) {
  return decimalHundredths(bps).replace(/\.?0+$/, "");
}
export function organiserFeeWording(version: PricingVersion) {
  const example = previewPricing({ ticketPaise: 100000, feePayer: "organiser" }, version);
  const gateway =
    version.gateway_mode === "pass_at_cost" && version.gateway_bps > 0
      ? `plus payment gateway at cost (${rateText(version.gateway_bps)}% + GST)`
      : "payment gateway absorbed";
  return `Free for free events. Paid tickets: ${rateText(version.platform_pct)}% + ${formatInr(version.fixed_fee_paise).replace("₹", "₹ ")} + ${rateText(version.gst_bps)}% GST, ${gateway}. On a ₹ 1,000 ticket incl. GST, you receive ${formatInr(example.organiserPayoutPaise).replace("₹", "₹ ")}.`;
}
