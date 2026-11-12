import "server-only";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { cancellationMessage, refundPolicyText } from "./rules";

type Client = SupabaseClient<Database>;
const quoteSchema = z.object({
  hours: z.number().int(),
  percent: z.number().int().nullable(),
  remaining: z.number().int(),
  amount: z.number().int(),
  paused: z.boolean(),
  automatic: z.boolean(),
});
const pauseSchema = z.object({
  event_paused: z.boolean(),
  site_paused: z.boolean(),
  waiting: z.number().int(),
  waiting_paise: z.number().int(),
});

export async function readRefundRules(client: Client, eventId: string) {
  const { data, error } = await client
    .from("event_refund_rules")
    .select("min_hours_before, refund_percent")
    .eq("event_id", eventId);
  if (error) throw new Error("Refund rules could not be loaded.");
  return data;
}

export async function readRefundPolicyText(client: Client, eventId: string, policy: string) {
  return refundPolicyText(
    policy,
    policy === "schedule" ? await readRefundRules(client, eventId) : [],
  );
}

export async function loadBuyerQuote(client: Client, orderId: string) {
  const { data, error } = await client.rpc("buyer_refund_quote", { p_order_id: orderId });
  if (error) return { quote: null, message: error.code === "P0001" ? error.message : "" };
  const quote = quoteSchema.parse(data);
  return { quote, message: cancellationMessage(quote) };
}

export async function loadRefundPause(client: Client, eventId: string | null) {
  const { data, error } = await client.rpc("refund_pause_status", { p_event_id: eventId });
  if (error) throw new Error("Refund pause settings could not be loaded.");
  return pauseSchema.parse(data);
}
