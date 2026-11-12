import { productionPaymentLock } from "@/lib/payments/model";

export const DELETE_TICKETS =
  "You still have upcoming tickets. Those bookings must be refunded or used before you can delete your account.";
export const DELETE_ORGANISER =
  "You still run events with this account. Close them in the organiser console, or visit Help, before you delete your account.";
export const OWN_ORGANISER_REFUND =
  "You belong to this organiser. Confirm you are refunding your own organiser.";
export const PAYMENTS_REFUND_UNAVAILABLE =
  "Online refunds are not available yet. Please check back soon.";

const secretLike =
  /qr_secret|vendor_id|access_token|service_role|sb_secret_|cashfree_secret|bank_account|account_number|eyJ[A-Za-z0-9_-]{10,}/i;

export function remainingRefundable(buyerTotalPaise: number, processedPaise: number) {
  if (!Number.isSafeInteger(buyerTotalPaise) || !Number.isSafeInteger(processedPaise))
    throw new RangeError("Refund amounts must be safe integers.");
  if (buyerTotalPaise < 0 || processedPaise < 0)
    throw new RangeError("Refund amounts cannot be negative.");
  return Math.max(0, buyerTotalPaise - processedPaise);
}

/**
 * Integer share of a stored column. The refund that completes the booking
 * takes whatever is left so the parts add up without using floats.
 */
export function scaledPaise(input: {
  refundPaise: number;
  partPaise: number;
  buyerTotalPaise: number;
  alreadyPartPaise: number;
  alreadyRefundedPaise: number;
}) {
  for (const value of Object.values(input)) {
    if (!Number.isSafeInteger(value)) throw new RangeError("Refund amounts must be safe integers.");
  }
  const remainingPart = input.partPaise - input.alreadyPartPaise;
  if (remainingPart <= 0 || input.refundPaise <= 0 || input.buyerTotalPaise <= 0) return 0;
  if (input.alreadyRefundedPaise + input.refundPaise === input.buyerTotalPaise)
    return remainingPart;
  const raw = Math.floor((input.refundPaise * input.partPaise) / input.buyerTotalPaise);
  return Math.min(raw, remainingPart);
}

export function orderStatusAfter(buyerTotalPaise: number, processedPaise: number) {
  if (processedPaise <= 0) return "paid" as const;
  if (processedPaise >= buyerTotalPaise) return "refunded" as const;
  return "partially_refunded" as const;
}

export type PayoutPlan =
  | { action: "none" }
  | { action: "cancel" }
  | { action: "reduce"; nextAmountPaise: number }
  | { action: "exception"; amountPaise: number };

export function payoutPlan(input: {
  payoutStatus: "scheduled" | "on_hold" | "settled" | "failed" | "cancelled" | null;
  payoutAmountPaise: number;
  reversalPaise: number;
  fullRefund: boolean;
}): PayoutPlan {
  if (!input.payoutStatus || input.reversalPaise <= 0) return { action: "none" };
  if (input.payoutStatus === "settled")
    return { action: "exception", amountPaise: input.reversalPaise };
  if (input.payoutStatus === "cancelled") return { action: "none" };
  if (
    input.payoutStatus !== "scheduled" &&
    input.payoutStatus !== "on_hold" &&
    input.payoutStatus !== "failed"
  )
    return { action: "none" };
  if (input.fullRefund || input.reversalPaise >= input.payoutAmountPaise)
    return { action: "cancel" };
  return { action: "reduce", nextAmountPaise: input.payoutAmountPaise - input.reversalPaise };
}

export type RefundRoute = "mock" | "cashfree" | "refuse";

export function refundRoute(
  env: {
    NODE_ENV?: string;
    VERCEL_ENV?: string;
    CASHFREE_ENV?: string;
    PAYMENTS_ALLOW_MOCK?: string;
    hasCredentials: boolean;
  },
  isTest: boolean,
): RefundRoute {
  const name = env.CASHFREE_ENV;
  if (name && !["mock", "sandbox", "production"].includes(name)) return "refuse";
  const mockOptIn = env.PAYMENTS_ALLOW_MOCK === "true" && name === "mock";
  let mode: RefundRoute;
  if (productionPaymentLock(env)) {
    if (mockOptIn) mode = "mock";
    else if (!env.hasCredentials || name === "mock") mode = "refuse";
    else mode = "cashfree";
  } else if (name === "mock" || (!name && !env.hasCredentials)) mode = "mock";
  else if (!env.hasCredentials) mode = "refuse";
  else mode = "cashfree";
  if (mode === "cashfree" && isTest) return "mock";
  return mode;
}

export function staffRefundConfirm(input: {
  actingAsStaff: boolean;
  belongsToOrganiser: boolean;
  confirmed: boolean;
}) {
  if (input.actingAsStaff && input.belongsToOrganiser && !input.confirmed)
    return OWN_ORGANISER_REFUND;
  return null;
}

export function deletionGuard(input: { upcomingValidTickets: number; runsEvents: boolean }) {
  if (input.upcomingValidTickets > 0) return { allowed: false as const, message: DELETE_TICKETS };
  if (input.runsEvents) return { allowed: false as const, message: DELETE_ORGANISER };
  return { allowed: true as const, message: "" };
}

export type ExportOrder = { id: string; buyerId: string; eventTitle: string; totalPaise: number };
export type ExportTicket = { code: string; buyerId: string; status: string };

export function rowsForBuyer<T extends { buyerId: string }>(rows: readonly T[], buyerId: string) {
  return rows.filter((row) => row.buyerId === buyerId);
}

export function assertExportSafe(value: unknown) {
  const text = JSON.stringify(value);
  if (secretLike.test(text)) throw new Error("Export contains a secret.");
  return value;
}

export function refundCopy(input: { status: string; isTest: boolean }) {
  if (input.status === "requested")
    return "Your request is waiting for the organiser. Your tickets stay valid until it is approved.";
  if (input.status === "rejected") return "This refund request was declined.";
  if (input.status === "failed") return "This refund did not go through. You can try again.";
  if (input.status === "approved")
    return "Your refund is being sent to your original payment method.";
  if (input.isTest) return "Test refund. No money was sent to a bank.";
  return "Your refund is going back to your original payment method.";
}
