import { createHmac } from "node:crypto";
import { expect, it, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
const { service, transition, maybeSingle } = vi.hoisted(() => ({
  service: vi.fn(),
  transition: vi.fn(),
  maybeSingle: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: service }));
vi.mock("@/lib/checkout/store", () => ({ transition }));
import { POST } from "./route";
beforeEach(() => {
  vi.stubEnv("CASHFREE_WEBHOOK_SECRET", "synthetic-secret");
  vi.clearAllMocks();
  service.mockReturnValue({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) });
  maybeSingle.mockResolvedValue({
    data: { id: "11000000-0000-4000-8000-000000000001", total_paise: 100000 },
  });
});
const payload = {
  type: "PAYMENT_SUCCESS_WEBHOOK",
  data: {
    order: {
      order_id: "11000000-0000-4000-8000-000000000001",
      order_amount: 1000,
      order_currency: "INR",
    },
    payment: {
      cf_payment_id: 12345,
      payment_status: "SUCCESS",
      payment_amount: 1000,
      payment_currency: "INR",
      upi_id: "must-never-persist",
    },
  },
};
function request(body: string, valid = true) {
  const ts = "1793498400000";
  return new Request("https://example.test/api/cashfree/webhook", {
    method: "POST",
    body,
    headers: {
      "x-webhook-timestamp": ts,
      "x-webhook-signature": valid
        ? createHmac("sha256", "synthetic-secret")
            .update(ts + body)
            .digest("base64")
        : "invalid",
    },
  });
}
it("returns 401 before touching the DB for tampered signatures", async () => {
  expect((await POST(request(JSON.stringify(payload), false))).status).toBe(401);
  expect(service).not.toHaveBeenCalled();
  expect(transition).not.toHaveBeenCalled();
});
it("uses the same dedupe key for repeated delivery; only persists an allowlist", async () => {
  const body = JSON.stringify(payload);
  await POST(request(body));
  await POST(request(body));
  expect(transition).toHaveBeenCalledTimes(2);
  expect(transition.mock.calls[0][2].id).toBe(transition.mock.calls[1][2].id);
  expect(JSON.stringify(transition.mock.calls)).not.toContain("must-never-persist");
});
it("rejects a signed but incorrect amount", async () => {
  expect(
    (
      await POST(
        request(
          JSON.stringify({
            ...payload,
            data: { ...payload.data, order: { ...payload.data.order, order_amount: 1 } },
          }),
        ),
      )
    ).status,
  ).toBe(400);
  expect(transition).not.toHaveBeenCalled();
});
