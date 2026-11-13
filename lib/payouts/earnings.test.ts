import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { decryptBankNumber, encryptBankNumber } from "./bank";
import { bankSheetHeaders, bankSheetRows, sheetCsv } from "./bank-sheet";
import { earningsPaymentCopy, paymentDate } from "./earnings";
import { earningsRows } from "./earnings-sheet";
import { spreadsheetText } from "./spreadsheet";

afterEach(() => vi.unstubAllEnvs());

it("keeps integer paise consistent across earnings columns", () => {
  expect(
    earningsRows([
      {
        id: "event",
        title: "Concert",
        gross_paise: 10000,
        fee_paise: 500,
        gst_paise: 90,
        charges_paise: 410,
        refunds_paise: 3333,
        earnings_paise: 6000,
        paid_paise: 2501,
        remaining_paise: 3499,
        available_paise: 1200,
        later_paise: 2299,
        next_available_at: null,
      },
    ]),
  ).toEqual([["Concert", 100, 5, 0.9, 4.1, 33.33, 60, 25.01, 34.99, 12, 22.99, ""]]);
  expect(earningsPaymentCopy(1)).toContain("1 working day after your event ends");
  expect(paymentDate({ paid_on: "2026-11-14" } as Parameters<typeof paymentDate>[0])).toBe(
    "14 Nov 2026",
  );
});

it("escapes every text cell of bank downloads and preserves account leading zeroes", () => {
  const rows = bankSheetRows([
    {
      beneficiary: '  =HYPERLINK("fixture")',
      accountNumber: "00123456789012345678",
      ifsc: "+unsafe",
      amountPaise: 10001,
      eventTitle: "=Event\nNext",
    },
  ]);
  const csv = sheetCsv(bankSheetHeaders, rows);
  expect(csv).toContain(`"'  =HYPERLINK(""fixture"")"`);
  expect(csv).toContain('"00123456789012345678"');
  expect(csv).toContain('"\'+unsafe",100.01,"Tikatero payout =Event Next"');
  for (const prefix of ["=", "+", "-", "@", "\n", "\t", "\r", "＠"])
    expect(spreadsheetText(`${prefix}unsafe`)).toBe(`'${prefix}unsafe`);
});

it("encrypts verified account numbers with a host-bound envelope", () => {
  vi.stubEnv("PAYOUT_BANK_ENCRYPTION_KEY", Buffer.alloc(32, 19).toString("base64url"));
  const number = "001234567890";
  const first = encryptBankNumber(number, "host-a");
  expect(first).not.toContain(number);
  expect(encryptBankNumber(number, "host-a")).not.toBe(first);
  expect(decryptBankNumber(first, "host-a")).toBe(number);
  expect(() => decryptBankNumber(first, "host-b")).toThrow();
});
