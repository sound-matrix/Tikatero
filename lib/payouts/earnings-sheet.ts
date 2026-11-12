import type { EarningsEvent, PayoutHistory } from "./earnings";
import { paymentDate } from "./earnings";
import { formatIst } from "@/lib/format";
import { excelRupees } from "./spreadsheet";

export const earningsHeaders = [
  "Event",
  "Ticket money",
  "Tikatero fee",
  "GST on fee",
  "Payment charges",
  "Refunds",
  "Your earnings",
  "Paid to you",
  "Still to be paid",
  "Available now",
  "Available later",
  "Next payment date",
];
export const historyHeaders = ["Date", "Amount", "Method", "Bank reference", "Event", "Status"];

export function earningsRows(events: EarningsEvent[]) {
  return events.map((event) => [
    event.title,
    ...[
      event.gross_paise,
      event.fee_paise,
      event.gst_paise,
      event.charges_paise,
      event.refunds_paise,
      event.earnings_paise,
      event.paid_paise,
      event.remaining_paise,
      event.available_paise,
      event.later_paise,
    ].map(excelRupees),
    event.next_available_at ? formatIst(event.next_available_at) : "",
  ]);
}
export function historyRows(history: PayoutHistory[]) {
  return history.map((row) => [
    paymentDate(row),
    excelRupees(row.amount_paise),
    row.method?.toUpperCase() ?? "",
    row.bank_reference ?? "",
    row.event_title ?? "All events",
    row.voided_at ? "Voided" : "Paid",
  ]);
}
