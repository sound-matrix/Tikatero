import "server-only";

import ExcelJS from "exceljs";
import type { EventSales, ExcelRows } from "./read";
import { excelIstDate, excelRupees, istDateStamp, spreadsheetText } from "./spreadsheet";

type Cell = string | number | Date | null;
const rupees = '"₹"#,##0.00;[Red]-"₹"#,##0.00';
const dateTime = 'dd mmm yyyy hh:mm "IST"';
const payoutLabels: Record<string, string> = {
  scheduled: "To be paid",
  settled: "Paid",
  failed: "Could not be paid",
  on_hold: "On hold",
  cancelled: "Cancelled",
};

function sheet(book: ExcelJS.Workbook, name: string, header: string[], rows: Cell[][]) {
  const tab = book.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  tab.addRow(header);
  tab.getRow(1).font = { bold: true };
  const widths = header.map((value) => value.length + 2);
  for (const values of rows) {
    const row = tab.addRow(
      values.map((value) => (typeof value === "string" ? spreadsheetText(value) : value)),
    );
    values.forEach((value, i) => {
      const width = value instanceof Date ? 25 : String(value ?? "").length + 2;
      widths[i] = Math.max(widths[i], Math.min(55, width));
      if (value instanceof Date) row.getCell(i + 1).numFmt = dateTime;
    });
  }
  widths.forEach((width, index) => {
    tab.getColumn(index + 1).width = Math.max(12, width);
  });
  return tab;
}

function moneyColumns(sheet: ExcelJS.Worksheet, indexes: number[]) {
  for (const index of indexes) {
    sheet.getColumn(index).numFmt = rupees;
    sheet.getColumn(index).width = Math.max(sheet.getColumn(index).width ?? 0, 18);
  }
}
function payoutRow(row: ExcelRows["payouts"][number]): Cell[] {
  return [
    excelIstDate(row.settled_at ?? row.created_at),
    excelRupees(row.amount_paise),
    payoutLabels[row.status] ?? row.status,
    excelIstDate(row.expected_at),
  ];
}

export function buildEventWorkbook(event: EventSales, rows: ExcelRows, now: Date) {
  const book = new ExcelJS.Workbook();
  const live = event.live;
  const summary = sheet(
    book,
    "Summary",
    ["Event sales", "Value"],
    [
      ["Event", event.title],
      ["Date", excelIstDate(event.starts_at)],
      ["Venue", live.venue],
      ["Tickets sold", live.tickets_sold],
      ["Tickets left", live.tickets_left],
      ["Venue seats left", live.seats_left],
      ["Venue capacity", live.capacity],
      ["Money from tickets", excelRupees(live.ticket_money_paise)],
      ["Tikatero fee", excelRupees(live.fee_paise)],
      ["GST on fee", excelRupees(live.fee_gst_paise)],
      ["Payment gateway fee", excelRupees(live.gateway_paise)],
      ["Refunds", excelRupees(live.refunded_paise)],
      ["Your part of refunds", excelRupees(live.organiser_refunds_paise)],
      ["Your share", excelRupees(live.share_paise)],
      ["Already paid", excelRupees(live.paid_out_paise)],
      ["To be paid", excelRupees(live.to_be_paid_paise)],
      ["On hold", excelRupees(live.on_hold_paise)],
      ["Downloaded on", excelIstDate(now.toISOString())],
    ],
  );
  for (let row = 9; row <= 18; row++) summary.getCell(row, 2).numFmt = rupees;
  summary.getRow(15).font = { bold: true };
  const tickets = sheet(
    book,
    "Ticket types",
    ["Name", "Price", "Sold", "Left", "Being booked now", "Money", "Your share", "Checked in"],
    live.ticket_types.map((row) => [
      row.name,
      excelRupees(row.price_paise),
      row.sold,
      row.left,
      row.qty_held,
      excelRupees(row.money_paise),
      excelRupees(row.share_paise),
      row.checked_in,
    ]),
  );
  moneyColumns(tickets, [2, 6, 7]);
  const orders = sheet(
    book,
    "Orders",
    [
      "Order ID",
      "Paid on (IST)",
      "Ticket types",
      "Qty",
      "Ticket money",
      "Fee",
      "GST",
      "Gateway fee",
      "Refund",
      "Your share",
      "Status",
    ],
    rows.orders.map((row) => [
      row.id,
      excelIstDate(row.paid_at),
      row.ticket_types,
      row.qty,
      excelRupees(row.subtotal_paise),
      excelRupees(row.platform_fee_paise),
      excelRupees(row.platform_fee_gst_paise),
      excelRupees(row.gateway_fee_paise),
      excelRupees(row.refund_paise),
      excelRupees(row.share_paise),
      row.status,
    ]),
  );
  moneyColumns(orders, [5, 6, 7, 8, 9, 10]);
  moneyColumns(
    sheet(
      book,
      "Payouts",
      ["Date", "Amount", "Status", "Expected date"],
      rows.payouts.map(payoutRow),
    ),
    [2],
  );
  const daily = sheet(
    book,
    "Sales by day",
    ["Date (IST)", "Bookings", "Money from tickets"],
    live.sales_by_day.map((row) => [
      new Date(`${row.date}T00:00:00Z`),
      row.orders,
      excelRupees(row.money_paise),
    ]),
  );
  daily.getColumn(1).numFmt = "dd mmm yyyy";
  moneyColumns(daily, [3]);
  return book;
}

export function buildAllEventsWorkbook(
  events: { event: EventSales; payouts: ExcelRows["payouts"] }[],
) {
  const book = new ExcelJS.Workbook();
  const summary = sheet(
    book,
    "Summary",
    [
      "Event",
      "Starts (IST)",
      "Venue",
      "Tickets sold",
      "Tickets left",
      "Money from tickets",
      "Refunds",
      "Your share",
      "Already paid",
      "To be paid",
      "On hold",
    ],
    events.map(({ event }) => [
      event.title,
      excelIstDate(event.starts_at),
      event.live.venue,
      event.live.tickets_sold,
      event.live.tickets_left,
      excelRupees(event.live.ticket_money_paise),
      excelRupees(event.live.refunded_paise),
      excelRupees(event.live.share_paise),
      excelRupees(event.live.paid_out_paise),
      excelRupees(event.live.to_be_paid_paise),
      excelRupees(event.live.on_hold_paise),
    ]),
  );
  moneyColumns(summary, [6, 7, 8, 9, 10, 11]);
  moneyColumns(
    sheet(
      book,
      "Payouts",
      ["Event", "Date", "Amount", "Status", "Expected date"],
      events.flatMap(({ event, payouts }) =>
        payouts.map((row) => [event.title, ...payoutRow(row)]),
      ),
    ),
    [3],
  );
  return book;
}

export async function excelResponse(book: ExcelJS.Workbook, title: string, now: Date) {
  const slug =
    title
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "event";
  const body = new Uint8Array(await book.xlsx.writeBuffer());
  return new Response(body, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="Tikatero-${slug}-${istDateStamp(now)}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
