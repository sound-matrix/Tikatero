import { expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { buildEventWorkbook } from "./xlsx";
import { excelIstDate, excelRupees, istDateStamp, spreadsheetText } from "./spreadsheet";
import type { EventSales } from "./read";

vi.mock("server-only", () => ({}));

it("exports five sheets, stores amounts and IST dates as numbers and dates, and escapes user text", async () => {
  const event = {
    title: "=Test event",
    starts_at: "2026-11-12T12:30:00.000Z",
    live: {
      venue: "+Riverfront",
      tickets_sold: 1,
      tickets_left: 9,
      capacity: null,
      seats_left: null,
      ticket_money_paise: 150000,
      fee_paise: 9000,
      fee_gst_paise: 1620,
      gateway_paise: 2245,
      organiser_refunds_paise: 45000,
      refunded_paise: 50000,
      share_paise: 92135,
      paid_out_paise: 0,
      to_be_paid_paise: 92135,
      on_hold_paise: 0,
      ticket_types: [
        {
          name: "@General",
          price_paise: 150000,
          sold: 1,
          left: 9,
          qty_held: 0,
          money_paise: 150000,
          share_paise: 92135,
          checked_in: 0,
        },
      ],
      sales_by_day: [{ date: "2026-11-12", money_paise: 150000, orders: 1 }],
    },
  } as EventSales;
  const book = buildEventWorkbook(
    event,
    { orders: [], payouts: [] },
    new Date("2026-11-12T22:00:00Z"),
  );
  const readBack = new ExcelJS.Workbook();
  await readBack.xlsx.load(await book.xlsx.writeBuffer());
  expect(readBack.worksheets.map((sheet) => sheet.name)).toEqual([
    "Summary",
    "Ticket types",
    "Orders",
    "Payouts",
    "Sales by day",
  ]);
  const summary = readBack.getWorksheet("Summary")!;
  expect(summary.getCell("B2").value).toBe("'=Test event");
  expect(summary.getCell("B3").value).toEqual(new Date("2026-11-12T18:00:00.000Z"));
  expect(summary.getCell("B4").value).toBe("'+Riverfront");
  expect(summary.getCell("B15").value).toBe(921.35);
  expect(summary.getCell("B15").numFmt).toContain("₹");
  expect(summary.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
  expect(readBack.getWorksheet("Ticket types")?.getCell("A2").value).toBe("'@General");
});

it("neutralises each formula prefix and converts paise and Indian dates without losing precision", () => {
  for (const start of ["=", "+", "-", "@", "\t", "\r"])
    expect(spreadsheetText(`${start}text`)).toBe(`'${start}text`);
  expect(spreadsheetText("Indie concert")).toBe("Indie concert");
  expect(excelRupees(95339)).toBe(953.39);
  expect(excelIstDate("2026-11-12T18:30:00Z")).toEqual(new Date("2026-11-13T00:00:00Z"));
  expect(istDateStamp(new Date("2026-11-12T18:30:00Z"))).toBe("2026-11-13");
});
