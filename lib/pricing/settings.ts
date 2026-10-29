import { validateVersion, type PricingVersion } from "./compute";
/** Parse rupees/percent directly into paise/bps; never parseFloat money. */
export function parseHundredths(text: string) {
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) throw new Error("Use a non-negative number with at most two decimal places.");
  const value = BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Value is too large.");
  return Number(value);
}
export function parseSettings(
  fields: Record<string, string>,
  current: PricingVersion,
): PricingVersion {
  if (!/^\d{1,3}$/.test(fields.payout_days)) throw new Error("Use whole payout days (0–365).");
  const result: PricingVersion = {
    ...current,
    platform_pct: parseHundredths(fields.platform_pct),
    fixed_fee_paise: parseHundredths(fields.fixed_fee),
    gateway_bps: parseHundredths(fields.gateway_pct),
    gateway_mode: fields.gateway_mode as PricingVersion["gateway_mode"],
    payout_days: Number(fields.payout_days),
  };
  validateVersion(result);
  return result;
}
