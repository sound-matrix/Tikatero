import { createHmac } from "node:crypto";
import { describe, expect, it, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
import {
  cashfreeBody,
  providerPaise,
  verifyWebhook,
  mockConfirmationAllowed,
  orderIsTest,
  type ProviderOrder,
} from "./model";
import { Cashfree, CASHFREE_API_VERSION } from "./cashfree";
import { paymentProvider } from ".";
import { CashfreeSplit } from "@/lib/payouts/provider";
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
  payout_mode: "gateway_split",
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
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        order_id: order.id,
        order_amount: total.buyer_total / 100,
        order_currency: "INR",
        payment_session_id: "test-session",
      }),
    });
    vi.stubGlobal("fetch", fetch);
    await new Cashfree(new CashfreeSplit()).createOrder(input, "https://tickets.example.test");
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
it("allows production mock only as an explicit opt-in, and preview/dev without keys", () => {
  vi.stubEnv("CASHFREE_APP_ID", "");
  vi.stubEnv("CASHFREE_SECRET_KEY", "");
  vi.stubEnv("CASHFREE_ENV", "");
  vi.stubEnv("PAYMENTS_ALLOW_MOCK", "");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "production");
  expect(() => paymentProvider()).toThrow(/payments not configured/);
  vi.stubEnv("PAYMENTS_ALLOW_MOCK", "true");
  vi.stubEnv("CASHFREE_ENV", "mock");
  expect(paymentProvider().mode).toBe("mock");
  expect(orderIsTest("mock", { CASHFREE_ENV: "mock" })).toBe(true);
  expect(orderIsTest("cashfree", { CASHFREE_ENV: "production" })).toBe(false);
  vi.stubEnv("PAYMENTS_ALLOW_MOCK", "");
  vi.stubEnv("CASHFREE_ENV", "");
  vi.stubEnv("VERCEL_ENV", "preview");
  expect(paymentProvider().mode).toBe("mock");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("NODE_ENV", "development");
  expect(paymentProvider().mode).toBe("mock");
});
it("rejects a provider create response for a different amount", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        order_id: order.id,
        order_amount: 1,
        order_currency: "INR",
        payment_session_id: "session",
      }),
    }),
  );
  await expect(
    new Cashfree(new CashfreeSplit()).createOrder(order, "https://example.test"),
  ).rejects.toThrow("invalid order");
});

it("expires an absent remote order after its hold deadline", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
  expect(
    (await new Cashfree().fetchOrderStatus({ ...order, hold_expires_at: "2020-01-01T00:00:00Z" }))
      .state,
  ).toBe("expired");
});
it("retains a pending order on provider network errors", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
  await expect(new Cashfree().fetchOrderStatus(order)).rejects.toThrow();
});

it("uses a stable Cashfree identity and preferred payment methods for signed-in checkout", () => {
  const origin = "https://tickets.example.test";
  expect(cashfreeBody(order, origin).customer_details.customer_id).toBe(order.id);
  const customer_id = "afe3721f-2010-4dce-9c16-105e3c9b9b02";
  for (const [preferred_method, methods] of [
    ["upi", "upi"],
    ["card", "cc,dc"],
    ["netbanking", "nb"],
    ["ask", undefined],
  ] as const) {
    const payload = cashfreeBody({ ...order, customer_id, preferred_method }, origin);
    expect(payload.customer_details).toMatchObject({
      customer_id,
      customer_email: order.buyer_email,
      customer_phone: order.buyer_phone,
    });
    expect(payload.order_meta.payment_methods).toBe(methods);
  }
});

it("creates a standard Cashfree order with no recipient or split", () => {
  const body = cashfreeBody(
    { ...order, vendor_id: null, payout_mode: "manual" },
    "https://tickets.example.test",
  );
  expect(body).not.toHaveProperty("order_splits");
  expect(providerPaise(body.order_amount)).toBe(order.total_paise);
  expect(() =>
    cashfreeBody(
      { ...order, vendor_id: null, payout_mode: "gateway_split" },
      "https://tickets.example.test",
    ),
  ).toThrow(/not ready/);
});

it("selects the Instamojo skeleton without running network operations", async () => {
  const gateway = paymentProvider("instamojo");
  expect(gateway.name).toBe("instamojo");
  await expect(gateway.createOrder(order, "https://tickets.example.test")).rejects.toThrow(
    /not configured/,
  );
  expect(() => paymentProvider("razorpay")).toThrow(/not configured/);
  expect(() => paymentProvider("payu")).toThrow(/not configured/);
});
