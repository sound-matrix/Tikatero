import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({
  from: vi.fn(),
  ready: vi.fn(),
  settle: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: mock.from }) }));
vi.mock("./complete", () => ({ refundPaymentsReady: mock.ready, settleOpenedRefund: mock.settle }));
vi.mock("./notify", () => ({ notifyEventCancelled: mock.notify }));

import { processEventRefunds } from "./event-refunds";

const event = { id: "event", title: "Music Night" };
const order = {
  id: "order",
  buyer_email: "buyer@example.test",
  buyer_name: "Buyer",
  status: "paid",
  total_paise: 2000,
  is_test: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mock.notify.mockResolvedValue(null);
  mock.from.mockImplementation((name: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      not: () => chain,
      order: () => chain,
      range: () => Promise.resolve({ data: [order], error: null }),
      maybeSingle: vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            id: "refund",
            amount_paise: 2000,
            organiser_reversal_paise: 1800,
            cf_refund_id: null,
          },
          error: null,
        })
        .mockResolvedValue({ data: null, error: null }),
    };
    if (name === "orders") return chain;
    return { ...chain, select: () => ({ ...chain, eq: () => ({ ...chain, eq: () => chain }) }) };
  });
});

it("leaves the approved refund queued when payment credentials are unavailable", async () => {
  mock.ready.mockReturnValue(false);
  await expect(processEventRefunds(event, "Venue closed")).resolves.toBe(true);
  expect(mock.from).toHaveBeenCalledExactlyOnceWith("orders");
  expect(mock.settle).not.toHaveBeenCalled();
  expect(mock.notify).toHaveBeenCalledWith(expect.objectContaining({ reason: "Venue closed" }));
});

it("passes the persisted refund identifier and exact amounts to the existing refund processor", async () => {
  mock.ready.mockReturnValue(true);
  mock.settle.mockRejectedValueOnce(new Error("Provider timeout"));
  await expect(processEventRefunds(event, "Venue closed")).resolves.toBe(true);
  expect(mock.settle).toHaveBeenCalledExactlyOnceWith(
    {
      refund_id: "refund",
      order_id: "order",
      amount_paise: 2000,
      reversal_paise: 1800,
      needs_provider: true,
      is_test: false,
    },
    true,
  );
});
