import ExcelJS from "exceljs";
import { requireStaff } from "@/lib/admin/access";
import { uuid } from "@/lib/admin/model";
import { decryptBankNumber } from "@/lib/payouts/bank";
import { bankSheetHeaders, bankSheetRows, sheetCsv } from "@/lib/payouts/bank-sheet";
import { spreadsheetText } from "@/lib/payouts/spreadsheet";
import { excelResponse } from "@/lib/payouts/xlsx";

type BankRow = {
  id: string;
  beneficiary: string;
  ifsc: string;
  encrypted_number: string;
  amount_paise: number;
  event_title: string;
};

export async function GET(request: Request) {
  const { client } = await requireStaff();
  const query = new URL(request.url).searchParams;
  const event = query.get("event") || null;
  if (event && !uuid(event)) return new Response(null, { status: 400 });
  const { data, error } = await client.rpc("admin_payout_bank_details", {
    p_organiser: null,
    p_event: event,
    p_test: false,
    p_export: true,
  });
  if (error) return new Response(null, { status: 503 });
  if (data === null)
    return new Response("Too many downloads. Try again in an hour.", { status: 429 });
  try {
    const rows = bankSheetRows(
      (data as BankRow[]).map((row) => ({
        beneficiary: row.beneficiary,
        accountNumber: decryptBankNumber(row.encrypted_number, row.id),
        ifsc: row.ifsc,
        amountPaise: row.amount_paise,
        eventTitle: row.event_title,
      })),
    );
    if (query.get("format") === "xlsx") {
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet("Bank transfers");
      sheet.addRow(bankSheetHeaders);
      sheet.getRow(1).font = { bold: true };
      sheet.columns.forEach((column) => {
        column.width = 24;
      });
      sheet.getColumn(4).numFmt = "0.00";
      sheet.addRows(
        rows.map((row) =>
          row.map((cell) => (typeof cell === "string" ? spreadsheetText(cell) : cell)),
        ),
      );
      return excelResponse(book, "bank-transfers", new Date());
    }
    return new Response(sheetCsv(bankSheetHeaders, rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="bank-transfers.csv"',
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return new Response("The bank sheet could not be created.", { status: 503 });
  }
}
