import { expect, it } from "vitest";
import { payoutsCsv, salesCsv, staffSalesCsv } from "./csv";

const payouts = [
  {
    organiserId: "org-a",
    eventTitle: "River night",
    status: "scheduled",
    amountPaise: 95339,
    expectedAt: "2026-11-11T12:30:00.000Z",
    settledAt: null,
    isTest: true,
  },
  {
    organiserId: "org-b",
    eventTitle: "Other night",
    status: "scheduled",
    amountPaise: 5000,
    expectedAt: "2026-11-11T12:30:00.000Z",
    settledAt: null,
    isTest: false,
  },
];

it("exports only the caller organiser, with rupees, paise, and IST, and no secrets", () => {
  const csv = payoutsCsv(payouts, "org-a");
  expect(csv).toContain("amount_paise");
  expect(csv).toContain("95339");
  expect(csv).toContain("₹953.39");
  expect(csv).toContain("11 Nov 2026, 6:00 PM IST");
  expect(csv).toContain("test");
  expect(csv).not.toContain("org-b");
  expect(csv).not.toContain("Other night");
  expect(csv).not.toContain("5000");
  expect(csv).not.toMatch(/sb_secret_|vendor_id|account_number|CASHFREE_SECRET/i);
  expect(csv).not.toMatch(/sent to your bank/i);
});

it("keeps another organiser's sales rows out of the download", () => {
  const csv = salesCsv(
    [
      {
        organiserId: "org-a",
        eventTitle: "River night",
        orderId: "order-a",
        paidAt: "2026-11-06T12:30:00.000Z",
        subtotalPaise: 100000,
        platformFeePaise: 2000,
        platformFeeGstPaise: 360,
        gatewayFeePaise: 2301,
        organiserSharePaise: 95339,
        buyerTotalPaise: 100000,
      },
      {
        organiserId: "org-b",
        eventTitle: "Secret night",
        orderId: "order-b",
        paidAt: null,
        subtotalPaise: 1,
        platformFeePaise: 0,
        platformFeeGstPaise: 0,
        gatewayFeePaise: 0,
        organiserSharePaise: 1,
        buyerTotalPaise: 1,
      },
    ],
    "org-a",
  );
  expect(csv).toContain("order-a");
  expect(csv).toContain("platform_fee_gst_paise");
  expect(csv).not.toContain("order-b");
  expect(csv).not.toContain("Secret night");
  expect(csv).not.toMatch(/@|sb_secret_|bank/i);
});

it("shows absorbed gateway cost only on the staff sheet", () => {
  const csv = staffSalesCsv([
    {
      eventTitle: "River night",
      orderId: "order-a",
      paidAt: "2026-11-06T12:30:00.000Z",
      organiserSharePaise: 97640,
      platformSharePaise: 2360,
      gatewayFeePaise: 0,
      absorbedGatewayPaise: 2301,
      platformNetPaise: 59,
      buyerTotalPaise: 100000,
    },
  ]);
  expect(csv).toContain("absorbed_gateway_paise");
  expect(csv).toContain("2301");
  expect(csv).toContain("97640");
  expect(csv).not.toMatch(/sb_secret_|account_number/i);
});
