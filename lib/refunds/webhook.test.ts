import { describe, expect, it } from "vitest";
import { refundWebhookCommand } from "./webhook";
import { presentAccountExport } from "./present";

const refundId = "11000000-0000-4000-8000-000000000009";
const orderId = "11000000-0000-4000-8000-000000000001";

describe("refund webhooks", () => {
  it("ignores payment events and accepts a verified-shape refund", () => {
    expect(refundWebhookCommand({ type: "PAYMENT_SUCCESS_WEBHOOK" })).toBeNull();
    expect(
      refundWebhookCommand({
        type: "REFUND_STATUS_WEBHOOK",
        data: {
          refund: {
            refund_id: refundId,
            order_id: orderId,
            cf_refund_id: "cf_refund_1234",
            refund_amount: 1000,
            refund_status: "SUCCESS",
            refund_arn: "bank-ref-do-not-keep",
          },
        },
      }),
    ).toEqual({
      error: null,
      refundId,
      orderId,
      cfRefundId: "cf_refund_1234",
      amountPaise: 100000,
      outcome: "processed",
    });
  });

  it("rejects a refund event that is missing its id", () => {
    expect(refundWebhookCommand({ type: "REFUND_STATUS_WEBHOOK", data: {} })).toEqual({
      error: "invalid",
    });
  });
});

it("formats an export in IST and INR and drops nothing secret that was not provided", () => {
  const presented = presentAccountExport({
    profile: { full_name: "Asha", phone: "98" },
    orders: [
      {
        id: orderId,
        event_title: "River Night",
        status: "paid",
        paid_at: "2026-11-10T12:30:00.000Z",
        total_paise: 150000,
        is_test: true,
      },
    ],
    tickets: [
      {
        code: "TK-TEST1-01",
        event_title: "River Night",
        status: "valid",
        starts_at: "2027-06-01T12:30:00.000Z",
        is_test: true,
      },
    ],
    refunds: [],
  });
  expect(presented.orders[0].total).toBe("₹1,500 incl. GST");
  expect(presented.orders[0].paid_at_ist).toBe("10 Nov 2026, 6:00 PM IST");
  expect(presented.tickets[0].starts_at_ist).toBe("1 Jun 2027, 6:00 PM IST");
  expect(JSON.stringify(presented)).not.toMatch(/qr_secret|vendor_id/);
});
