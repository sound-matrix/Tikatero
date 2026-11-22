import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { spreadsheetText } from "@/lib/payouts/spreadsheet";

export type EventStatement = {
  event_id: string; event_title: string; host_name: string;
  event_starts_at: string | null; event_ends_at: string | null;
  booking_close_at: string | null; status: string;
  paid_booking_count: number; pending_order_count: number; pending_refund_count: number;
  gross_collected_paise: number; platform_fee_paise: number; platform_fee_gst_paise: number;
  gateway_fee_paise: number; processed_refund_paise: number; refunded_host_share_paise: number;
  paid_out_paise: number; remaining_host_paise: number; available_host_paise: number;
  latest_bank_reference: string | null; latest_transfer_date: string | null; statement_as_of: string;
};

export async function eventStatement(client: SupabaseClient<Database>, id: string) {
  const { data, error } = await client.rpc("event_settlement_statement", { p_event: id });
  if (error || !data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Settlement statement is not available for this account.");
  return data as EventStatement;
}

function cell(value: string | number | null): string {
  const safe = spreadsheetText(value === null ? "" : String(value));
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** Same disclosure-safe totals for host and Tikatero admin. Never include full bank details. */
export function eventStatementCsv(s: EventStatement): string {
  const fields: (keyof EventStatement)[] = [
    "event_id", "event_title", "host_name", "event_starts_at",
    "event_ends_at", "booking_close_at", "status", "paid_booking_count",
    "pending_order_count", "pending_refund_count", "gross_collected_paise",
    "platform_fee_paise", "platform_fee_gst_paise", "gateway_fee_paise",
    "processed_refund_paise", "refunded_host_share_paise", "paid_out_paise",
    "remaining_host_paise", "available_host_paise", "latest_bank_reference",
    "latest_transfer_date", "statement_as_of",
  ];
  return fields.join(",") + "\r\n" + fields.map((key) => cell(s[key])).join(",") + "\r\n";
}
