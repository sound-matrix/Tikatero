import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({ rpc: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc: mock.rpc,
    from: () => ({ update: () => ({ eq: mock.eq }) }),
  }),
}));
import { reconcileOnDemand } from "@/lib/checkout/store";
import type { CheckoutOrder } from "@/lib/checkout/model";

const order = {
  id: "11000000-0000-4000-8000-000000000001",
  status: "pending",
  payment_provider: "cashfree",
  total_paise: 100000,
  buyer_phone: "9876543210",
  buyer_name: "Test Buyer",
  buyer_email: "buyer@example.test",
  organiser_share_paise: 90000,
  vendor_id: "vendor_test",
  hold_expires_at: "2027-01-01T00:00:00.000Z",
  reconciled_at: null,
} as CheckoutOrder;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CASHFREE_ENV", "sandbox");
  vi.stubEnv("CASHFREE_APP_ID", "synthetic-id");
  vi.stubEnv("CASHFREE_SECRET_KEY", "synthetic-secret");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VERCEL_ENV", "");
  mock.rpc.mockResolvedValue({ data: "paid", error: null });
  mock.eq.mockResolvedValue({ error: null });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("reconciles one pending Cashfree order from the provider", async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      order_id: order.id,
      order_status: "PAID",
      order_amount: 1000,
      order_currency: "INR",
    }),
  });
  vi.stubGlobal("fetch", fetch);
  expect(await reconcileOnDemand(order)).toBe("paid");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(String(fetch.mock.calls[0][0])).toContain(`/orders/${order.id}`);
  expect(mock.rpc).toHaveBeenCalledWith(
    "checkout_transition",
    expect.objectContaining({ p_order_id: order.id, p_state: "paid", p_amount: 100000 }),
  );
});

it("rate-limits a repeat read of the same order", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(await reconcileOnDemand({ ...order, reconciled_at: new Date().toISOString() })).toBe(
    "pending",
  );
  expect(fetch).not.toHaveBeenCalled();
  expect(mock.rpc).not.toHaveBeenCalled();
});

it("stamps the attempt when the provider read fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
  expect(await reconcileOnDemand(order)).toBe("pending");
  expect(mock.eq).toHaveBeenCalledWith("id", order.id);
  expect(mock.rpc).not.toHaveBeenCalled();
});
