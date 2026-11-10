import "server-only";
import { PaymentsNotConfiguredError } from "@/lib/payments";
import { productionPaymentLock } from "@/lib/payments/model";
import { mockVendorId } from "./model";

export interface SplitVendor {
  mode: "mock" | "cashfree";
  ensureVendor(organiserId: string): Promise<{ vendorId: string }>;
  setSettlementHold(vendorId: string, hold: boolean): Promise<void>;
}

class SplitError extends Error {
  constructor() {
    super("The payout service is temporarily unavailable. Please try again.");
    this.name = "SplitError";
  }
}

function credentials() {
  const id = process.env.CASHFREE_APP_ID;
  const secret = process.env.CASHFREE_SECRET_KEY;
  if (!id || !secret) return null;
  return { id, secret };
}

export class MockSplit implements SplitVendor {
  readonly mode = "mock" as const;
  async ensureVendor(organiserId: string) {
    return { vendorId: mockVendorId(organiserId) };
  }
  async setSettlementHold() {
    return;
  }
}

/** Easy Split vendor settlement. Responses are not logged. */
export class CashfreeSplit implements SplitVendor {
  readonly mode = "cashfree" as const;
  private async request(path: string, init: RequestInit) {
    const keys = credentials();
    if (!keys) throw new SplitError();
    const base =
      process.env.CASHFREE_ENV === "production"
        ? "https://api.cashfree.com/pg"
        : "https://sandbox.cashfree.com/pg";
    const response = await fetch(`${base}${path}`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        "x-api-version": "2026-01-01",
        "x-client-id": keys.id,
        "x-client-secret": keys.secret,
        ...init.headers,
      },
    });
    if (!response.ok) throw new SplitError();
  }
  async ensureVendor(organiserId: string): Promise<{ vendorId: string }> {
    // Full account numbers are not stored. Do not invent a vendor or log the organiser id.
    if (!organiserId) throw new Error("Organiser could not be loaded.");
    throw new Error("A live payout account needs the verified bank account. Nothing was saved.");
  }
  async setSettlementHold(vendorId: string, hold: boolean) {
    if (!/^[\w-]{1,64}$/.test(vendorId) || vendorId.startsWith("mock_vendor_"))
      throw new Error("Payout account could not be updated.");
    await this.request(`/easy-split/vendors/${encodeURIComponent(vendorId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: hold ? "ON_HOLD" : "ACTIVE" }),
    });
  }
}

export function splitProvider(): SplitVendor {
  const env = process.env.CASHFREE_ENV;
  if (env && !["mock", "sandbox", "production"].includes(env))
    throw new Error("Payment environment is not configured correctly.");
  const mockOptIn = process.env.PAYMENTS_ALLOW_MOCK === "true" && env === "mock";
  const keys = credentials();
  if (productionPaymentLock()) {
    if (mockOptIn) return new MockSplit();
    if (!keys || env === "mock") throw new PaymentsNotConfiguredError();
    return new CashfreeSplit();
  }
  if (env === "mock" || (!env && !keys)) return new MockSplit();
  if (!keys) throw new Error("Payment credentials are not configured.");
  return new CashfreeSplit();
}
