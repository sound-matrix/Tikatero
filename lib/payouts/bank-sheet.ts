import { spreadsheetText } from "./spreadsheet";

export const bankSheetHeaders = [
  "Beneficiary name",
  "Account number",
  "IFSC",
  "Amount (INR)",
  "Narration",
];
export type BankSheetRow = {
  beneficiary: string;
  accountNumber: string;
  ifsc: string;
  amountPaise: number;
  eventTitle: string;
};

export function bankSheetRows(rows: BankSheetRow[]) {
  return rows.map((row) => [
    row.beneficiary,
    row.accountNumber,
    row.ifsc,
    row.amountPaise / 100,
    `Tikatero payout ${row.eventTitle}`.replace(/[\r\n\t]/g, " ").slice(0, 120),
  ]);
}

export function sheetCsv(headers: string[], rows: (string | number)[][]) {
  const lines = [headers, ...rows].map((row) =>
    row
      .map((cell) =>
        typeof cell === "number"
          ? String(cell)
          : `"${spreadsheetText(cell).replaceAll('"', '""')}"`,
      )
      .join(","),
  );
  return lines.join("\r\n") + "\r\n";
}
