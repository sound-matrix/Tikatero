import "server-only";
import { Cashfree } from "./cashfree";
import type { GatewayName, PayoutMode } from "./settings";
import { CashfreeSplit } from "@/lib/payouts/provider";
import { Instamojo } from "./instamojo";
import { MockPayment } from "./mock";
import { productionPaymentLock } from "./model";
export class PaymentsNotConfiguredError extends Error {
  constructor() {
    super("payments not configured");
    this.name = "PaymentsNotConfiguredError";
  }
}
function hasCashfreeCredentials() {
  return Boolean(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY);
}
export function paymentProvider(
  activeGateway: GatewayName = "cashfree",
  payoutMode: PayoutMode = "manual",
) {
  if (activeGateway === "instamojo") return new Instamojo();
  if (activeGateway !== "cashfree") throw new PaymentsNotConfiguredError();
  const env = process.env.CASHFREE_ENV;
  if (env && !["mock", "sandbox", "production"].includes(env))
    throw new Error("Payment environment is not configured correctly.");
  const mockOptIn = process.env.PAYMENTS_ALLOW_MOCK === "true" && env === "mock";
  if (productionPaymentLock()) {
    // Mock in production is an explicit pair of switches, never the default.
    if (mockOptIn) return new MockPayment();
    if (!hasCashfreeCredentials() || env === "mock") throw new PaymentsNotConfiguredError();
    return new Cashfree(payoutMode === "gateway_split" ? new CashfreeSplit() : undefined);
  }
  if (env === "mock" || (!env && !hasCashfreeCredentials())) return new MockPayment();
  if (!hasCashfreeCredentials()) throw new Error("Payment credentials are not configured.");
  return new Cashfree(payoutMode === "gateway_split" ? new CashfreeSplit() : undefined);
}
