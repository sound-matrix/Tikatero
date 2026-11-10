import { expect, it } from "vitest";
import { formatInr } from "@/lib/format";
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
  expect(csv).not.toContain("'95339");
  expect(csv).not.toContain("'₹953.39");
  expect(csv).not.toContain("'River night");
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

it("neutralises spreadsheet formulas in every export, including negative amounts", () => {
  const command = '=CMD("|curl evil")';
  const sum = "@SUM(A1)";
  const negativeInr = formatInr(-100);
  expect(negativeInr.startsWith("-")).toBe(true);
  const payouts = payoutsCsv(
    [
      {
        organiserId: "org-a",
        eventTitle: command,
        status: "scheduled",
        amountPaise: -100,
        expectedAt: null,
        settledAt: null,
        isTest: false,
      },
      {
        organiserId: "org-a",
        eventTitle: "River night",
        status: "scheduled",
        amountPaise: 95339,
        expectedAt: null,
        settledAt: null,
        isTest: false,
      },
      {
        organiserId: "org-b",
        eventTitle: "Other night",
        status: "scheduled",
        amountPaise: 5000,
        expectedAt: null,
        settledAt: null,
        isTest: false,
      },
    ],
    "org-a",
  );
  const sales = salesCsv(
    [
      {
        organiserId: "org-a",
        eventTitle: sum,
        orderId: "order-a",
        paidAt: null,
        subtotalPaise: 0,
        platformFeePaise: 0,
        platformFeeGstPaise: 0,
        gatewayFeePaise: 0,
        organiserSharePaise: -100,
        buyerTotalPaise: 0,
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
  const staff = staffSalesCsv([
    {
      eventTitle: "\t+River",
      orderId: "order-a",
      paidAt: null,
      organiserSharePaise: -100,
      platformSharePaise: 2360,
      gatewayFeePaise: 0,
      absorbedGatewayPaise: null,
      platformNetPaise: null,
      buyerTotalPaise: 100,
    },
  ]);
  for (const csv of [payouts, sales, staff]) {
    expect(csv).not.toMatch(/(^|,)[=+\-@\t\r]/m);
    expect(csv).not.toMatch(/sb_secret_|account_number|CASHFREE_SECRET/i);
  }
  expect(payouts).toContain(`"'${command.replaceAll('"', '""')}"`);
  expect(payouts).toContain(`"'-100"`);
  expect(payouts).toContain(`"'${negativeInr}"`);
  expect(payouts).toContain("River night");
  expect(payouts).not.toContain("'River night");
  expect(payouts).toContain("95339");
  expect(payouts).toContain("₹953.39");
  expect(payouts).not.toContain("Other night");
  expect(sales).toContain(`"'${sum}"`);
  expect(sales).toContain(`"'-100"`);
  expect(sales).toContain(`"'${negativeInr}"`);
  expect(sales).toContain("order-a");
  expect(sales).not.toContain("order-b");
  expect(sales).not.toContain("Secret night");
  expect(staff).toContain('"\'\t+River"');
  expect(staff).toContain(`"'-100"`);
  expect(staff).toContain("2360");
  expect(staff).not.toContain("'2360");
});
