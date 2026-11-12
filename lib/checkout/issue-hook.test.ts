import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const fulfil = vi.hoisted(() => vi.fn());
const processCancelled = vi.hoisted(() => vi.fn().mockResolvedValue(false));
vi.mock("@/lib/refunds/event-refunds", () => ({ processCancelledOrder: processCancelled }));
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/tickets/fulfil", () => ({
  fulfilPaidOrder: fulfil,
  sweepTicketFulfilment: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ rpc }),
}));

import { transition } from "@/lib/checkout/store";
import type { CheckoutOrder } from "@/lib/checkout/model";

const order = { id: "c1200005-0000-4000-8000-000000000001" } as CheckoutOrder;

it("issues tickets after a paid transition and leaves other states alone", async () => {
  rpc.mockResolvedValue({ data: "paid", error: null });
  fulfil.mockResolvedValue(undefined);
  await expect(transition(order, { state: "paid", amount: 100, currency: "INR" })).resolves.toBe(
    "paid",
  );
  expect(fulfil).toHaveBeenCalledWith(order.id);

  fulfil.mockClear();
  rpc.mockResolvedValue({ data: "expired", error: null });
  await transition(order, { state: "expired", amount: 100, currency: "INR" });
  expect(fulfil).not.toHaveBeenCalled();
});

it("keeps a paid order when ticket delivery fails", async () => {
  rpc.mockResolvedValue({ data: "paid", error: null });
  fulfil.mockRejectedValue(new Error("mail unavailable"));
  await expect(transition(order, { state: "paid", amount: 100, currency: "INR" })).resolves.toBe(
    "paid",
  );
});

it("queues the refund instead of issuing a ticket when a late payment arrives", async () => {
  rpc.mockResolvedValue({ data: "paid", error: null });
  processCancelled.mockResolvedValueOnce(true);
  fulfil.mockClear();
  await transition(order, { state: "paid", amount: 100, currency: "INR" });
  expect(processCancelled).toHaveBeenCalledWith(order);
  expect(fulfil).not.toHaveBeenCalled();
});
