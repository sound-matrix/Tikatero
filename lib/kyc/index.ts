import "server-only";
import type { KycProvider } from "./provider";
import { MockKycProvider } from "./mock";
import { CashfreeSecureId } from "./cashfree-secure-id";
export function kycProvider(): KycProvider {
  if (
    process.env.KYC_MODE === "mock" ||
    !process.env.CASHFREE_SECURE_ID_CLIENT_ID ||
    !process.env.CASHFREE_SECURE_ID_CLIENT_SECRET
  )
    return new MockKycProvider();
  return new CashfreeSecureId();
}

export function mockNeedsManualReview(): boolean {
  return (
    process.env.VERCEL_ENV === "production" ||
    (process.env.NODE_ENV === "production" && process.env.KYC_MODE !== "mock")
  );
}
