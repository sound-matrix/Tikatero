import { formatInr, formatIst } from "@/lib/format";
import { assertNoSecretText } from "./model";

export type PayoutCsvRow = {
  organiserId: string;
  eventTitle: string;
  status: string;
  amountPaise: number;
  expectedAt: string | null;
  settledAt: string | null;
  isTest: boolean;
};

export type SalesCsvRow = {
  organiserId: string;
  eventTitle: string;
  orderId: string;
  paidAt: string | null;
  subtotalPaise: number;
  platformFeePaise: number;
  platformFeeGstPaise: number;
  gatewayFeePaise: number;
  organiserSharePaise: number;
  buyerTotalPaise: number;
};

export type StaffSalesCsvRow = {
  eventTitle: string;
  orderId: string;
  paidAt: string | null;
  organiserSharePaise: number;
  platformSharePaise: number;
  gatewayFeePaise: number;
  absorbedGatewayPaise: number | null;
  platformNetPaise: number | null;
  buyerTotalPaise: number;
};

/** Spreadsheet apps treat these as formulas when they begin a cell. */
const formulaPrefix = /^[=+\-@\t\r]/;

function cell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  assertNoSecretText(text);
  const formula = formulaPrefix.test(text);
  const safe = formula ? `'${text}` : text;
  return formula || /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function inr(paise: number) {
  return formatInr(paise);
}

function when(value: string | null) {
  return value ? formatIst(value) : "";
}

function sheet(header: string[], lines: string[][]) {
  return [header.join(","), ...lines.map((line) => line.map(cell).join(","))].join("\r\n") + "\r\n";
}

export function payoutsCsv(rows: readonly PayoutCsvRow[], organiserId: string) {
  const lines = rows
    .filter((row) => row.organiserId === organiserId)
    .map((row) => [
      row.eventTitle,
      row.status,
      inr(row.amountPaise),
      String(row.amountPaise),
      when(row.expectedAt),
      when(row.settledAt),
      row.isTest ? "test" : "live",
    ]);
  return sheet(
    ["event", "status", "amount_inr", "amount_paise", "expected_ist", "settled_ist", "record"],
    lines,
  );
}

export function salesCsv(rows: readonly SalesCsvRow[], organiserId: string) {
  const lines = rows
    .filter((row) => row.organiserId === organiserId)
    .map((row) => [
      row.eventTitle,
      row.orderId,
      when(row.paidAt),
      inr(row.subtotalPaise),
      String(row.subtotalPaise),
      inr(row.platformFeePaise),
      String(row.platformFeePaise),
      inr(row.platformFeeGstPaise),
      String(row.platformFeeGstPaise),
      inr(row.gatewayFeePaise),
      String(row.gatewayFeePaise),
      inr(row.organiserSharePaise),
      String(row.organiserSharePaise),
      inr(row.buyerTotalPaise),
      String(row.buyerTotalPaise),
    ]);
  return sheet(
    [
      "event",
      "order_id",
      "paid_at_ist",
      "subtotal_inr",
      "subtotal_paise",
      "platform_fee_inr",
      "platform_fee_paise",
      "platform_fee_gst_inr",
      "platform_fee_gst_paise",
      "gateway_fee_inr",
      "gateway_fee_paise",
      "organiser_share_inr",
      "organiser_share_paise",
      "buyer_total_inr",
      "buyer_total_paise",
    ],
    lines,
  );
}

export function staffSalesCsv(rows: readonly StaffSalesCsvRow[]) {
  const lines = rows.map((row) => [
    row.eventTitle,
    row.orderId,
    when(row.paidAt),
    String(row.organiserSharePaise),
    String(row.platformSharePaise),
    String(row.gatewayFeePaise),
    row.absorbedGatewayPaise === null ? "" : String(row.absorbedGatewayPaise),
    row.platformNetPaise === null ? "" : String(row.platformNetPaise),
    String(row.buyerTotalPaise),
  ]);
  return sheet(
    [
      "event",
      "order_id",
      "paid_at_ist",
      "organiser_share_paise",
      "platform_share_paise",
      "gateway_fee_paise",
      "absorbed_gateway_paise",
      "platform_net_paise",
      "buyer_total_paise",
    ],
    lines,
  );
}
