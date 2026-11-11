import { nameMatch } from "@/lib/kyc/model";
import { computePricing, type PricingVersion, type TicketLine } from "@/lib/pricing/compute";

export const OWN_ORGANISER_CONTROL = "You cannot change payouts or sales on your own organiser";

const IST = "Asia/Kolkata";

export type LedgerAmounts = {
  buyer_total: number;
  organiser_share: number;
  platform_share: number;
  gateway_fee: number;
};

/** Stored order identity. Absorbed gateway cost is not part of this equation. */
export function ledgerConserves(amounts: LedgerAmounts) {
  return (
    amounts.buyer_total === amounts.organiser_share + amounts.platform_share + amounts.gateway_fee
  );
}

/**
 * Gateway cost Cashfree still charges when the pricing version absorbs it.
 * Same per-ticket half-up formula as pass-at-cost. Never subtracted from the
 * organiser's stored share.
 */
export function absorbedGatewayCost(lines: readonly TicketLine[], version: PricingVersion) {
  if (version.gateway_mode !== "absorb") return 0;
  const { total } = computePricing({
    lines,
    version: { ...version, gateway_mode: "pass_at_cost" },
    fee_payer: "organiser",
    is_free: false,
  });
  return total.gateway_fee;
}

export function platformNet(platformSharePaise: number, absorbedGatewayPaise: number) {
  if (!Number.isSafeInteger(platformSharePaise) || !Number.isSafeInteger(absorbedGatewayPaise))
    throw new RangeError("Platform amounts must be safe integers.");
  if (absorbedGatewayPaise < 0) throw new RangeError("Gateway cost cannot be negative.");
  return platformSharePaise - absorbedGatewayPaise;
}

export type PayoutDecision = "schedule" | "skip" | "flag";

/** Zero is left out quietly (free RSVP). A negative share is flagged and never clamped. */
export function payoutDecision(organiserSharePaise: number): PayoutDecision {
  if (!Number.isSafeInteger(organiserSharePaise))
    throw new RangeError("Organiser share must be a safe integer.");
  if (organiserSharePaise > 0) return "schedule";
  if (organiserSharePaise < 0) return "flag";
  return "skip";
}

export function assertPositivePaise(amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new RangeError("Payout amount must be a positive number of paise.");
  return amount;
}

function weekdayIst(date: Date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: IST, weekday: "short" }).format(date);
}

/**
 * Move forward by whole IST working days, keeping the clock time.
 * India has no daylight-saving shift, so 24-hour steps stay on the same clock time.
 * Saturday and Sunday are not working days.
 */
export function addIstWorkingDays(start: Date, days: number) {
  if (Number.isNaN(start.getTime())) throw new RangeError("Invalid date");
  if (!Number.isInteger(days) || days < 0 || days > 365)
    throw new RangeError("Payout days must be between 0 and 365.");
  let cursor = start;
  let left = days;
  let guard = 0;
  while (left > 0) {
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    if (weekdayIst(cursor) !== "Sat" && weekdayIst(cursor) !== "Sun") left -= 1;
    if (++guard > 400) throw new RangeError("Payout date could not be calculated.");
  }
  return cursor;
}

/**
 * Cashfree settles on the next working day. The organiser is then paid within
 * payout_days working days of that settlement. Until a settlement time exists,
 * the expected date is that full window, which is the later (conservative) date.
 */
export function expectedPayoutAt(input: {
  paidAt: Date;
  payoutDays: number;
  settledAt?: Date | null;
}) {
  if (input.settledAt && !Number.isNaN(input.settledAt.getTime()))
    return addIstWorkingDays(input.settledAt, input.payoutDays);
  return addIstWorkingDays(input.paidAt, 1 + input.payoutDays);
}

/** Stored pricing_versions.payout_days, or 2 when that row has no usable value. */
export function payoutWindowDays(stored: number | null | undefined) {
  if (typeof stored !== "number" || !Number.isInteger(stored) || stored < 0 || stored > 365)
    return 2;
  return stored;
}

export function payoutWindowCopy(payoutDays: number) {
  const days = payoutWindowDays(payoutDays);
  const noun = days === 1 ? "day" : "days";
  return `Usually paid within ${days} ${noun} of settlement.`;
}

export const LIVE_VENDOR_UNAVAILABLE = "A live payout account cannot be created yet.";

/** Staff-facing sentence. Never returns provider bodies, account numbers, or secrets. */
export function vendorFollowUp(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "The bank account name does not match the organiser name.") return message;
  if (message === "Verification settings need attention. Please contact support.") return message;
  if (message === LIVE_VENDOR_UNAVAILABLE) return message;
  return LIVE_VENDOR_UNAVAILABLE;
}

export function organiserControlError(
  actorId: string,
  ownerId: string,
  memberIds: readonly string[],
) {
  if (actorId === ownerId || memberIds.includes(actorId)) return OWN_ORGANISER_CONTROL;
  return null;
}

export type SettlementHoldPlan = "skip" | "call" | "refuse";

/**
 * Live vendor ids are held at Cashfree only when that API can actually be called.
 * Mock vendor ids and a missing vendor never pretend a bank hold happened.
 * Production without credentials refuses instead of skipping silently.
 */
export function settlementHoldPlan(input: {
  control: string;
  vendorId: string | null;
  productionLocked: boolean;
  provider: "mock" | "cashfree" | "unconfigured";
}): SettlementHoldPlan {
  if (input.control !== "payouts_on_hold") return "skip";
  const vendor = input.vendorId?.trim() ?? "";
  if (!vendor || vendor.startsWith("mock_vendor_")) return "skip";
  if (input.provider === "cashfree") return "call";
  if (input.productionLocked) return "refuse";
  return "skip";
}

const secretLike =
  /sb_secret_|eyJ[A-Za-z0-9_-]{10,}|CASHFREE_SECRET|SUPABASE_SERVICE_ROLE|bank_account|account_number/i;

/** Bank-verified name must match the KYC name. Returns the KYC name, or null. */
export function matchingKycName(bankName: string, kycName: string, threshold = 85) {
  const bank = bankName.trim();
  const kyc = kycName.trim();
  if (!bank || !kyc || bank.length > 150 || kyc.length > 150) return null;
  if (nameMatch(bank, kyc) < threshold) return null;
  return kyc;
}

export function mockVendorId(organiserId: string) {
  const compact = organiserId.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(compact)) throw new RangeError("Invalid organiser.");
  return `mock_vendor_${compact}`;
}

export function assertNoSecretText(value: string) {
  if (secretLike.test(value)) throw new Error("Payout text must not include secrets.");
}
