import { describe, expect, it } from "vitest";
import {
  assertExportSafe,
  deletionGuard,
  orderStatusAfter,
  payoutPlan,
  refundRoute,
  remainingRefundable,
  rowsForBuyer,
  scaledPaise,
  staffRefundConfirm,
  DELETE_ORGANISER,
  DELETE_TICKETS,
  OWN_ORGANISER_REFUND,
} from "./model";

describe("paise and split reversal", () => {
  it("scales the organiser share in integer paise and never exceeds what is left", () => {
    const first = scaledPaise({
      refundPaise: 50000,
      partPaise: 95339,
      buyerTotalPaise: 100000,
      alreadyPartPaise: 0,
      alreadyRefundedPaise: 0,
    });
    expect(first).toBe(47669);
    const second = scaledPaise({
      refundPaise: 50000,
      partPaise: 95339,
      buyerTotalPaise: 100000,
      alreadyPartPaise: first,
      alreadyRefundedPaise: 50000,
    });
    expect(second).toBe(47670);
    expect(first + second).toBe(95339);
    expect(remainingRefundable(100000, 100000)).toBe(0);
    expect(() => remainingRefundable(100000, -1)).toThrow();
  });

  it("gives the buyer the full total on a full refund and marks the order", () => {
    expect(
      scaledPaise({
        refundPaise: 100000,
        partPaise: 95339,
        buyerTotalPaise: 100000,
        alreadyPartPaise: 0,
        alreadyRefundedPaise: 0,
      }),
    ).toBe(95339);
    expect(orderStatusAfter(100000, 100000)).toBe("refunded");
    expect(orderStatusAfter(100000, 40000)).toBe("partially_refunded");
  });

  it("does not pay a scheduled payout after a full refund, and records an exception when it was paid", () => {
    expect(
      payoutPlan({
        payoutStatus: "scheduled",
        payoutAmountPaise: 95339,
        reversalPaise: 95339,
        fullRefund: true,
      }),
    ).toEqual({ action: "cancel" });
    expect(
      payoutPlan({
        payoutStatus: "on_hold",
        payoutAmountPaise: 95339,
        reversalPaise: 40000,
        fullRefund: false,
      }),
    ).toEqual({ action: "reduce", nextAmountPaise: 55339 });
    expect(
      payoutPlan({
        payoutStatus: "settled",
        payoutAmountPaise: 95339,
        reversalPaise: 95339,
        fullRefund: true,
      }),
    ).toEqual({ action: "exception", amountPaise: 95339 });
    expect(
      payoutPlan({
        payoutStatus: "cancelled",
        payoutAmountPaise: 95339,
        reversalPaise: 100,
        fullRefund: false,
      }),
    ).toEqual({ action: "none" });
  });
});

describe("mock versus production", () => {
  it("fails closed in production without keys and never calls live Cashfree for a test order", () => {
    expect(
      refundRoute(
        { NODE_ENV: "production", VERCEL_ENV: "production", hasCredentials: false },
        true,
      ),
    ).toBe("refuse");
    expect(
      refundRoute(
        {
          NODE_ENV: "production",
          VERCEL_ENV: "production",
          CASHFREE_ENV: "mock",
          PAYMENTS_ALLOW_MOCK: "true",
          hasCredentials: false,
        },
        false,
      ),
    ).toBe("mock");
    expect(
      refundRoute(
        {
          NODE_ENV: "production",
          VERCEL_ENV: "production",
          CASHFREE_ENV: "production",
          hasCredentials: true,
        },
        false,
      ),
    ).toBe("cashfree");
    expect(
      refundRoute(
        {
          NODE_ENV: "production",
          VERCEL_ENV: "production",
          CASHFREE_ENV: "production",
          hasCredentials: true,
        },
        true,
      ),
    ).toBe("mock");
    expect(refundRoute({ NODE_ENV: "test", hasCredentials: false }, true)).toBe("mock");
  });
});

describe("account guards and exports", () => {
  it("blocks deletion while a valid ticket or a live organiser remains", () => {
    expect(deletionGuard({ upcomingValidTickets: 1, runsEvents: false }).message).toBe(
      DELETE_TICKETS,
    );
    expect(deletionGuard({ upcomingValidTickets: 0, runsEvents: true }).message).toBe(
      DELETE_ORGANISER,
    );
    expect(deletionGuard({ upcomingValidTickets: 0, runsEvents: false }).allowed).toBe(true);
  });

  it("keeps another buyer's rows out and refuses secrets", () => {
    const orders = [
      { id: "a", buyerId: "me", eventTitle: "Mine", totalPaise: 100 },
      { id: "b", buyerId: "them", eventTitle: "Theirs", totalPaise: 200 },
    ];
    expect(rowsForBuyer(orders, "me").map((row) => row.id)).toEqual(["a"]);
    expect(
      assertExportSafe({ profile: { full_name: "Asha" }, orders: rowsForBuyer(orders, "me") }),
    ).toBeTruthy();
    expect(() => assertExportSafe({ vendor_id: "mock_vendor_secret" })).toThrow(/secret/);
    expect(() => assertExportSafe({ qr_secret: "v1" })).toThrow(/secret/);
  });

  it("asks a staff member to confirm a refund on their own organiser", () => {
    expect(
      staffRefundConfirm({ actingAsStaff: true, belongsToOrganiser: true, confirmed: false }),
    ).toBe(OWN_ORGANISER_REFUND);
    expect(
      staffRefundConfirm({ actingAsStaff: true, belongsToOrganiser: true, confirmed: true }),
    ).toBeNull();
    expect(
      staffRefundConfirm({ actingAsStaff: false, belongsToOrganiser: true, confirmed: false }),
    ).toBeNull();
  });
});
