import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { formatIst } from "@/lib/format";

type Client = SupabaseClient<Database>;
export type EarningsEvent = {
  id: string;
  title: string;
  gross_paise: number;
  fee_paise: number;
  gst_paise: number;
  charges_paise: number;
  refunds_paise: number;
  earnings_paise: number;
  paid_paise: number;
  remaining_paise: number;
  available_paise: number;
  later_paise: number;
  next_available_at: string | null;
};
export type PayoutHistory = {
  id: string;
  amount_paise: number;
  paid_on: string | null;
  settled_at: string | null;
  method: string | null;
  bank_reference: string | null;
  voided_at: string | null;
  event_title: string | null;
};
type Summary = Pick<
  EarningsEvent,
  "earnings_paise" | "paid_paise" | "remaining_paise" | "next_available_at"
> & { hold_days: number; has_test: boolean; events: EarningsEvent[]; history: PayoutHistory[] };
export type AdminHost = {
  id: string;
  display_name: string;
  kyc_status: string;
  payouts_on_hold: boolean;
  payout_mode_override: string | null;
  bank_passed: boolean;
  bank_holder_name: string | null;
  bank_acct_last4: string | null;
  bank_ifsc: string | null;
  available_paise: number;
  later_paise: number;
  remaining_paise: number;
  oldest_at: string | null;
  events: {
    event_id: string | null;
    title: string | null;
    available_paise: number;
    remaining_paise: number;
  }[];
};
type AdminOverview = {
  hosts: AdminHost[];
  history: (PayoutHistory & {
    organiser_id: string;
    note: string | null;
    proof_path: string | null;
    void_reason: string | null;
    paid_by: string;
    voided_by: string | null;
  })[];
  entries: {
    id: number;
    kind: string;
    amount_paise: number;
    balance_paise: number;
    available_at: string;
    created_at: string;
    created_by: string | null;
    note: string | null;
    event_title: string | null;
  }[];
};
type Reconciliation = {
  collected_paise: number;
  paid_paise: number;
  refunds_paise: number;
  adjustments_paise: number;
  expected_paise: number;
  balance_paise: number;
  difference_paise: number;
  available_paise: number;
  later_paise: number;
};

export async function hostEarnings(client: Client, test: boolean) {
  const { data, error } = await client.rpc("organiser_earnings_summary", { p_test: test });
  if (error || !data) throw new Error("Your earnings could not be loaded.");
  return data as unknown as Summary;
}
export async function adminPayouts(
  client: Client,
  test: boolean,
  event: string | null,
  host: string | null,
) {
  const { data, error } = await client.rpc("admin_payouts_overview", {
    p_test: test,
    p_event: event,
    p_host: host,
  });
  if (error || !data) throw new Error("Host payments could not be loaded.");
  return data as unknown as AdminOverview;
}
export async function earningsReconciliation(client: Client, test = false) {
  const { data, error } = await client.rpc("admin_earnings_reconciliation", { p_test: test });
  if (error || !data) throw new Error("Earnings could not be reconciled.");
  return data as unknown as Reconciliation;
}

export function paymentDate(row: PayoutHistory) {
  return row.paid_on
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(
        new Date(row.paid_on),
      )
    : row.settled_at
      ? formatIst(row.settled_at)
      : "";
}

export function earningsPaymentCopy(days: number) {
  const window =
    days === 0
      ? "when your event ends"
      : `within ${days} working ${days === 1 ? "day" : "days"} after your event ends`;
  return `Tikatero collects ticket money for you and sends your earnings to your bank account ${window}. You'll get an email with the bank reference each time.`;
}
