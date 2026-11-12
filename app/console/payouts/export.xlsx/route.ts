import ExcelJS from "exceljs";
import { requireAccount } from "@/lib/auth/account";
import { allowRequest } from "@/lib/security/rate-limit";
import { downloadLimit } from "@/lib/payouts/excel-download";
import { hostEarnings } from "@/lib/payouts/earnings";
import {
  earningsHeaders,
  earningsRows,
  historyHeaders,
  historyRows,
} from "@/lib/payouts/earnings-sheet";
import { excelResponse } from "@/lib/payouts/xlsx";
import { spreadsheetText } from "@/lib/payouts/spreadsheet";

export async function GET() {
  const { client, account } = await requireAccount();
  if (!account.organisers.length && !account.assignments?.some((item) => item.role === "manager"))
    return new Response(null, { status: 403 });
  if (!(await allowRequest("export-user", account.profile.id, 10, 3600))) return downloadLimit();
  const { events, history } = await hostEarnings(client, false);
  const book = new ExcelJS.Workbook();
  for (const [name, headers, rows] of [
    ["Your earnings", earningsHeaders, earningsRows(events)],
    ["Payments", historyHeaders, historyRows(history)],
  ] as const) {
    const sheet = book.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((column) => {
      column.width = 23;
      column.numFmt = "0.00";
    });
    sheet.addRows(
      rows.map((row) =>
        row.map((cell) => (typeof cell === "string" ? spreadsheetText(cell) : cell)),
      ),
    );
  }
  return excelResponse(book, "earnings", new Date());
}
