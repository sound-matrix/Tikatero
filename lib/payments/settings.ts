import "server-only";
import { connection } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export type PayoutMode = "manual" | "gateway_split";
export type GatewayName = "cashfree" | "instamojo" | "razorpay" | "payu";

export async function platformPayments(client = createServiceClient()) {
  const { data, error } = await client
    .from("platform_payment_settings")
    .select("payout_mode, active_gateway, payout_hold_days_after_event")
    .eq("id", true)
    .single();
  if (error || !data) throw new Error("Payment settings could not be loaded.");
  return data;
}

export async function publicPayoutHoldDays() {
  await connection();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return 2;
  return (await platformPayments()).payout_hold_days_after_event;
}
