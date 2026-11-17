import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { payuPaymentForm, payuRequestHash, payuResponseHash, payuTransactionId, payuVerifiedResponse } from "./payu";

describe("PayU hosted checkout security", () => {
  const order = {
    id: "11000000-0000-4000-8000-000000000001",
    buyer_name: "Test Buyer", buyer_email: "buyer@example.test",
    buyer_phone: "9876543210", total_paise: 12550,
    organiser_share_paise: 11000, vendor_id: null,
    payout_mode: "manual" as const, hold_expires_at: "2026-11-30T10:10:00Z",
  };
  it("uses stable, <=25 character transaction IDs", () => {
    expect(payuTransactionId(order.id)).toHaveLength(25);
    expect(payuTransactionId(order.id)).toBe(payuTransactionId(order.id));
  });
  it("signs a full-paise hosted checkout without exposing salt", () => {
    vi.stubEnv("PAYU_MERCHANT_KEY", "synthetic-test-key");
    vi.stubEnv("PAYU_MERCHANT_SALT", "synthetic-test-salt");
    vi.stubEnv("PAYU_ENV", "test");
    const result = payuPaymentForm(order, "https://www.tikatero.com");
    expect(result.fields.amount).toBe("125.50");
    expect(result.action).toBe("https://test.payu.in/_payment");
    expect(JSON.stringify(result)).not.toContain("synthetic-test-salt");
    expect(result.fields.hash).toBe(payuRequestHash(result.fields, "synthetic-test-salt"));
    vi.unstubAllEnvs();
  });
  it("rejects altered callback hashes", () => {
    const callback = {
      key: "key", txnid: payuTransactionId(order.id), amount: "125.50",
      productinfo: "Tikatero event tickets", firstname: "Test Buyer",
      email: "buyer@example.test", status: "success",
    };
    const fields = { ...callback, hash: payuResponseHash(callback, "salt") };
    expect(payuVerifiedResponse(fields, "key", "salt")).toBe(true);
    expect(payuVerifiedResponse({ ...fields, amount: "1.00" }, "key", "salt")).toBe(false);
    expect(payuVerifiedResponse({ ...fields, status: "failure" }, "key", "salt")).toBe(false);
  });
});
