import { createHmac } from "node:crypto";
import { describe, expect, it, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
import {
  cashfreeBody,
  providerPaise,
  verifyWebhook,
  mockConfirmationAllowed,
  type ProviderOrder,
} from "./model";
import { Cashfree, CASHFREE_API_VERSION } from "./cashfree";
import { paymentProvider } from ".";
import { computePricing } from "@/lib/pricing/compute";
import { launchPricing } from "@/lib/pricing";
const order: ProviderOrder = {
  id: "11000000-0000-4000-8000-000000000001",
  buyer_name: "Test Buyer",
  buyer_email: "buyer@example.test",
  buyer_phone: "9876543210",
  total_paise: 100000,
  organiser_share_paise: 95339,
  vendor_id: "vendor_test",
  hold_expires_at: "2026-11-01T10:10:00Z",
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Cashfree signature", () => {
  const raw = '{"amount":170.00}',
    timestamp = "1793498400000",
    secret = "synthetic-test-secret";
  const signature = createHmac("sha256", secret)
    .update(timestamp + raw)
    .digest("base64");
  it("authenticates the unmodified raw body", () =>
    expect(verifyWebhook(raw, timestamp, signature, secret)).toBe(true));
  it.each([
    ['{"amount":170}', timestamp, signature, secret],
    [raw, "1793498400001", signature, secret],
    [raw, timestamp, signature, "wrong"],
    [raw, timestamp, "bogus", secret],
    [raw, null, signature, secret],
    [raw, timestamp, signature, ""],
  ])("rejects tampering/missing headers", (body, ts, sig, key) =>
    expect(verifyWebhook(body!, ts, sig, key!)).toBe(false),
  );
});
it.each(["buyer", "organiser"] as const)(
  "sends the exact computed buyer total and organiser split (%s)",
  async (fee_payer) => {
    const { total } = computePricing({
      lines: [
        { price_paise: 123456, qty: 3 },
        { price_paise: 100001, qty: 2 },
      ],
      version: launchPricing,
      fee_payer,
      is_free: false,
    });
    const input = {
      ...order,
      total_paise: total.buyer_total,
      organiser_share_paise: total.organiser_share,
    };
    const fetch = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          order_id: order.id,
          order_amount: total.buyer_total / 100,
          order_currency: "INR",
          payment_session_id: "test-session",
        }),
      });
    vi.stubGlobal("fetch", fetch);
    await new Cashfree().create(input, "https://tickets.example.test");
    const [url, request] = fetch.mock.calls[0];
    const body = JSON.parse(request.body);
    expect(url).toBe("https://sandbox.cashfree.com/pg/orders");
    expect(request.headers["x-api-version"]).toBe(CASHFREE_API_VERSION);
    expect(request.headers["x-idempotency-key"]).toBe(order.id);
    expect(providerPaise(body.order_amount)).toBe(total.buyer_total);
    expect(providerPaise(body.order_splits[0].amount)).toBe(total.organiser_share);
    expect(total.buyer_total).toBe(
      total.organiser_share + total.platform_share + total.gateway_fee,
    );
  },
);
it("rejects non-positive splits and sub-rupee Cashfree orders", () => {
  expect(() =>
    cashfreeBody({ ...order, organiser_share_paise: 0 }, "https://example.test"),
  ).toThrow();
  expect(() =>
    cashfreeBody({ ...order, total_paise: 99, organiser_share_paise: 50 }, "https://example.test"),
  ).toThrow();
});
it("mock cannot confirm a production order without an explicit opt-in", () => {
  expect(mockConfirmationAllowed({ NODE_ENV: "production" })).toBe(false);
  expect(mockConfirmationAllowed({ NODE_ENV: "production", PAYMENTS_ALLOW_MOCK: "true" })).toBe(
    true,
  );
  expect(mockConfirmationAllowed({ NODE_ENV: "test" })).toBe(true);
});
it("selects mock without keys; fails closed for incomplete live configuration", () => {
  vi.stubEnv("CASHFREE_ENV", "");
  vi.stubEnv("CASHFREE_APP_ID", "");
  vi.stubEnv("CASHFREE_SECRET_KEY", "");
  expect(paymentProvider().mode).toBe("mock");
  vi.stubEnv("CASHFREE_ENV", "production");
  expect(() => paymentProvider()).toThrow();
  vi.stubEnv("CASHFREE_APP_ID", "synthetic-id");
  vi.stubEnv("CASHFREE_SECRET_KEY", "synthetic-secret");
  expect(paymentProvider().mode).toBe("cashfree");
});
it("rejects a provider create response for a different amount", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          order_id: order.id,
          order_amount: 1,
          order_currency: "INR",
          payment_session_id: "session",
        }),
      }),
  );
  await expect(new Cashfree().create(order, "https://example.test")).rejects.toThrow(
    "invalid order",
  );
});
