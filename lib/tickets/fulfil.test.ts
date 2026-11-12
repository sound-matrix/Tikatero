import { afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const send = vi.hoisted(() => vi.fn());
const rpcCalls = vi.hoisted(() => [] as string[]);
const state = vi.hoisted(() => ({
  emailedAt: null as string | null,
  issueError: null as { message: string } | null,
  issueCount: 1,
  outbox: [] as { order_id: string }[],
  reviews: [] as { order_id: string }[],
}));

const orderId = "c1200005-0000-4000-8000-000000000001";
const eventId = "c1200003-0000-4000-8000-000000000001";
const order = {
  id: orderId,
  status: "paid",
  buyer_email: "buyer@example.test",
  buyer_name: "Buyer",
  total_paise: 79900,
  event_id: eventId,
  is_test: true,
  get emailed_at() {
    return state.emailedAt;
  },
};
const event = {
  id: eventId,
  title: "Diwali Night",
  starts_at: "2026-11-07T12:30:00.000Z",
  ends_at: null,
  gates_open_at: "2026-11-07T12:00:00.000Z",
  venue_name: "NSCI Dome",
  refund_policy: "none",
  address: "Worli",
  city: "Mumbai",
  maps_url: null,
  lat: null,
  lng: null,
};
const tickets = [
  {
    id: "c1200006-0000-4000-8000-000000000001",
    code: "TK-01Z01-01",
    seq: 1,
    holder_name: "Asha",
    ticket_type_id: "c1200004-0000-4000-8000-000000000001",
    order_id: orderId,
    event_id: eventId,
  },
];

vi.mock("@/lib/email/send", () => ({ send }));
vi.mock("@/lib/storage", () => ({ privateStorageConfigured: () => false, putPrivatePdf: vi.fn() }));
vi.mock("@/lib/tickets/pdf", () => ({ renderTicketPdf: async () => Buffer.from("%PDF-1.4") }));
vi.mock("@/lib/tickets/qr", () => ({
  signTicket: (code: string) => `${code}.sig`,
  signTicketLink: (code: string) => ({ token: "100.sig", path: `/t/${code}?t=100.sig` }),
  ticketQrPng: async () => Buffer.from("png"),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc(name: string) {
      rpcCalls.push(name);
      if (name === "issue_tickets")
        return Promise.resolve({ data: state.issueCount, error: state.issueError });
      return Promise.resolve({ data: true, error: null });
    },
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let selected = "*";
      const rows = () => {
        if (table === "orders" && selected === "id") return [order];
        if (table === "orders") return order;
        if (table === "tickets") return tickets;
        if (table === "events") return event;
        if (table === "ticket_types")
          return [
            { id: tickets[0].ticket_type_id, name: "General", is_vip: false, price_paise: 79900 },
          ];
        if (table === "order_outbox" && filters.topic === "payment.review_required")
          return state.reviews;
        if (table === "order_outbox") return state.outbox;
        return null;
      };
      const api = {
        select(columns = "*") {
          selected = columns;
          return api;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return api;
        },
        is(column: string, value: unknown) {
          filters[column] = value;
          return api;
        },
        in() {
          return api;
        },
        order() {
          return api;
        },
        limit() {
          return api;
        },
        update(values: { emailed_at?: string }) {
          return {
            eq() {
              if (values.emailed_at) state.emailedAt = values.emailed_at;
              const done = Promise.resolve({ error: null });
              return Object.assign(done, { is: () => done });
            },
          };
        },
        maybeSingle: async () => ({ data: rows(), error: null }),
        then(
          onFulfilled: (value: { data: unknown; error: null }) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) {
          return Promise.resolve({ data: rows(), error: null }).then(onFulfilled, onRejected);
        },
      };
      return api;
    },
  }),
}));

import { fulfilPaidOrder, sweepTicketFulfilment } from "./fulfil";

afterEach(() => {
  send.mockReset();
  rpcCalls.length = 0;
  state.emailedAt = null;
  state.issueError = null;
  state.issueCount = 1;
  state.outbox = [];
  state.reviews = [];
  vi.unstubAllEnvs();
});

it("sends one confirmation with the ticket PDF and does not print the address", async () => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://tikatero.example");
  vi.stubEnv("VERCEL_ENV", "preview");
  send.mockResolvedValue({ status: "sent" });
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await fulfilPaidOrder(orderId);
  expect(rpcCalls).toContain("issue_tickets");
  expect(send).toHaveBeenCalledOnce();
  expect(send.mock.calls[0][0].attachments[0].filename).toBe("TK-01Z01-01.pdf");
  expect(send.mock.calls[0][0].data.testBooking).toBe(true);
  expect(send.mock.calls[0][0].data.tickets[0].path).toBe("/t/TK-01Z01-01?t=100.sig");
  expect(state.emailedAt).toBeTruthy();
  await fulfilPaidOrder(orderId);
  expect(send).toHaveBeenCalledOnce();
  expect(error).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
  error.mockRestore();
  log.mockRestore();
});

it("retries a definite provider failure and does not mark the email as sent", async () => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://tikatero.example");
  send.mockResolvedValue({ status: "failed" });
  await fulfilPaidOrder(orderId);
  expect(state.emailedAt).toBeNull();
  expect(rpcCalls.filter((name) => name === "release_failed_order_email").length).toBeGreaterThan(
    0,
  );
});

it("does not email when issuing fails or a review blocks the sweep", async () => {
  state.issueError = { message: "locked" };
  await expect(fulfilPaidOrder(orderId)).rejects.toThrow(/could not be issued/);
  expect(send).not.toHaveBeenCalled();
  state.issueError = null;
  state.outbox = [{ order_id: orderId }];
  state.reviews = [{ order_id: orderId }];
  await expect(sweepTicketFulfilment()).resolves.toEqual({ attempted: 0, failed: 0 });
  expect(send).not.toHaveBeenCalled();
});
