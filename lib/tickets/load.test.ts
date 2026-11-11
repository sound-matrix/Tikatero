import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  orderStatus: "partially_refunded",
  ticketStatus: "valid",
}));

const orderId = "c1500005-0000-4000-8000-000000000001";
const eventId = "c1500003-0000-4000-8000-000000000001";
const code = "TK-RF010-01";

vi.mock("@/lib/tickets/access", () => ({ ticketAccessAllowed: async () => true }));
vi.mock("@/lib/tickets/qr", () => ({
  signTicket: (value: string) => `${value}.sig`,
  ticketQrPng: async () => Buffer.from("png"),
  ticketQrSvg: async () => "<svg></svg>",
}));
vi.mock("@/lib/tickets/pdf", () => ({ renderTicketPdf: async () => Buffer.from("%PDF-1.4") }));
vi.mock("node:fs/promises", () => ({ readFile: async () => Buffer.from("logo") }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const result = () => {
        if (table === "orders") {
          return {
            data: {
              id: orderId,
              status: state.orderStatus,
              buyer_id: "buyer",
              buyer_name: "Asha",
              event_id: eventId,
              is_test: true,
              access_token_hash: null,
            },
            error: null,
          };
        }
        if (table === "events") {
          return {
            data: {
              id: eventId,
              title: "Refund Night",
              starts_at: "2027-06-01T12:30:00.000Z",
              ends_at: null,
              gates_open_at: null,
              venue_name: "Hall",
              address: null,
              city: "Mumbai",
              maps_url: null,
              lat: null,
              lng: null,
            },
            error: null,
          };
        }
        if (table === "ticket_types") {
          return {
            data: [{ id: "tier", name: "General", is_vip: false, price_paise: 150000 }],
            error: null,
          };
        }
        const ticket = {
          id: "ticket",
          code,
          seq: 1,
          holder_name: "Asha",
          pdf_key: null,
          order_id: orderId,
          event_id: eventId,
          ticket_type_id: "tier",
          status: state.ticketStatus,
        };
        return { data: filters.code ? ticket : [ticket], error: null };
      };
      const builder = {
        select: () => builder,
        eq(key: string, value: unknown) {
          filters[key] = value;
          return builder;
        },
        order: () => builder,
        maybeSingle: () => Promise.resolve(result()),
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          return Promise.resolve(result()).then(resolve, reject);
        },
      };
      return builder;
    },
  }),
}));

import { loadOrderTickets, loadTicket, loadTicketPdf } from "./load";

beforeEach(() => {
  state.orderStatus = "partially_refunded";
  state.ticketStatus = "valid";
});

it("regenerates a PDF for a remaining valid ticket after a partial refund", async () => {
  const loaded = await loadTicket(code);
  expect(loaded?.admitted).toBe(true);
  expect(loaded?.qrPayload).toBe(`${code}.sig`);
  const pdf = await loadTicketPdf(code);
  expect(pdf?.pdf?.subarray(0, 5).toString()).toBe("%PDF-");
  expect(await loadOrderTickets(orderId)).toEqual([{ href: `/t/${code}`, label: "Ticket 1 of 1" }]);
});

it("does not serve a QR or PDF for a refunded ticket", async () => {
  state.ticketStatus = "refunded";
  const loaded = await loadTicket(code);
  expect(loaded?.admitted).toBe(false);
  expect(loaded?.qrPayload).toBeNull();
  expect(await loadTicketPdf(code)).toBeNull();
});

it("does not serve a QR or PDF for a void or transferred ticket", async () => {
  for (const status of ["void", "transferred"]) {
    state.ticketStatus = status;
    const loaded = await loadTicket(code);
    expect(loaded?.qrPayload).toBeNull();
    expect(await loadTicketPdf(code)).toBeNull();
  }
});

it("regenerates the same ticket PDF on a repeated fetch", async () => {
  const first = await loadTicketPdf(code);
  const second = await loadTicketPdf(code);
  expect(first?.pdf?.subarray(0, 5).toString()).toBe("%PDF-");
  expect(second?.pdf?.equals(first!.pdf!)).toBe(true);
});
