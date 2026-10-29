/** All money is integer paise; rates are integer basis points. */
export type PricingVersion = {
  id: string;
  platform_pct: number;
  fixed_fee_paise: number;
  gst_bps: number;
  gateway_mode: "pass_at_cost" | "absorb";
  gateway_bps: number;
  payout_days: number;
};
export type TicketLine = { price_paise: number; qty: number };
export type Amounts = {
  subtotal: number;
  platform_fee: number;
  platform_fee_gst: number;
  gateway_fee: number;
  buyer_total: number;
  organiser_share: number;
  platform_share: number;
};
export type PricingInput = {
  lines: readonly TicketLine[];
  version: PricingVersion;
  fee_payer: "organiser" | "buyer";
  is_free: boolean;
};
function integer(value: number, name: string, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max)
    throw new RangeError(`${name} must be a non-negative safe integer (at most ${max}).`);
}
export function validateVersion(version: PricingVersion) {
  for (const rate of [version.platform_pct, version.gst_bps, version.gateway_bps])
    integer(rate, "Basis points", 10000);
  integer(version.fixed_fee_paise, "Fixed fee");
  integer(version.payout_days, "Payout days", 365);
  if (!["pass_at_cost", "absorb"].includes(version.gateway_mode))
    throw new RangeError("Choose a gateway mode.");
}
function safe(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER))
    throw new RangeError("Pricing exceeds the safe integer paise range.");
  return Number(value);
}
/** Half-up for non-negative values, with exact bigint intermediate arithmetic. */
const bps = (amount: bigint, rate: number) =>
  (amount * BigInt(rate) + BigInt(5000)) / BigInt(10000);
const keys = [
  "subtotal",
  "platform_fee",
  "platform_fee_gst",
  "gateway_fee",
  "buyer_total",
  "organiser_share",
  "platform_share",
] as const;
const zero = (): Amounts => Object.fromEntries(keys.map((key) => [key, 0])) as Amounts;
/**
 * Round HALF-UP per ticket, per component, BEFORE multiplying by qty.
 * Platform fee = round(price × platform bps) + fixed; GST = round(that fee × GST bps).
 * Gateway at cost = round(ticket price × gateway bps) + round(gateway base × GST bps).
 * Gateway is based on ticket price, never buyer_total (no circular gross-up).
 * Absorbed gateway has zero charge in this model. platform_share includes fee GST;
 * it is a settlement allocation, not platform net revenue.
 * Free events/zero-priced tickets have zero fees. A tiny paid ticket can have a
 * negative organiser share; never clamp it and silently break the ledger identity.
 */
export function computePricing({ lines, version, fee_payer, is_free }: PricingInput) {
  validateVersion(version);
  if (!["organiser", "buyer"].includes(fee_payer)) throw new RangeError("Choose a fee payer.");
  if (typeof is_free !== "boolean") throw new RangeError("Choose whether the event is free.");
  const total = zero();
  const calculated = lines.map(({ price_paise, qty }) => {
    integer(price_paise, "Ticket price");
    integer(qty, "Quantity");
    const price = is_free ? BigInt(0) : BigInt(price_paise);
    const fee =
      price > BigInt(0)
        ? bps(price, version.platform_pct) + BigInt(version.fixed_fee_paise)
        : BigInt(0);
    const gst = bps(fee, version.gst_bps);
    const gatewayBase =
      version.gateway_mode === "pass_at_cost" ? bps(price, version.gateway_bps) : BigInt(0);
    const gateway = gatewayBase + bps(gatewayBase, version.gst_bps);
    const platform = fee + gst;
    const perTicket = {
      subtotal: price,
      platform_fee: fee,
      platform_fee_gst: gst,
      gateway_fee: gateway,
      buyer_total: price + (fee_payer === "buyer" ? platform + gateway : BigInt(0)),
      organiser_share: price - (fee_payer === "organiser" ? platform + gateway : BigInt(0)),
      platform_share: platform,
    };
    const amounts = zero();
    for (const key of keys) {
      amounts[key] = safe(perTicket[key] * BigInt(qty));
      total[key] = safe(BigInt(total[key]) + BigInt(amounts[key]));
    }
    return { price_paise, qty, ...amounts };
  });
  return { pricing_version_id: version.id, lines: calculated, total };
}
