import "server-only";
import { providerPaise } from "@/lib/payments/model";
import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/db/types";
import { notifyPayoutSettled } from "./notify";

const statuses = {
  VENDOR_SETTLEMENT_SUCCESS: "settled",
  VENDOR_SETTLEMENT_FAILED: "failed",
  VENDOR_SETTLEMENT_ON_HOLD: "on_hold",
} as const;

export function settlementCommand(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const type = (body as { type?: unknown }).type;
  if (typeof type !== "string" || !(type in statuses)) return null;
  const data = (body as { data?: { settlement?: Record<string, unknown> } }).data?.settlement;
  if (!data) return { error: "invalid" as const };
  const orderId = data.order_id;
  const settlementId = data.settlement_id;
  const paymentStatus = data.status;
  if (
    typeof orderId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(orderId) ||
    typeof settlementId !== "string" ||
    !/^[A-Za-z0-9:_-]{8,120}$/.test(settlementId)
  )
    return { error: "invalid" as const };
  const expected =
    type === "VENDOR_SETTLEMENT_SUCCESS"
      ? "SUCCESS"
      : type === "VENDOR_SETTLEMENT_FAILED"
        ? "FAILED"
        : "ON_HOLD";
  if (paymentStatus !== expected) return { error: "invalid" as const };
  let amount: number;
  try {
    amount = providerPaise(data.settlement_amount);
  } catch {
    return { error: "invalid" as const };
  }
  const settledAt = typeof data.settled_on === "string" ? data.settled_on : null;
  return {
    error: null,
    orderId,
    settlementId,
    status: statuses[type as keyof typeof statuses],
    amount,
    settledAt,
  };
}

export async function applySettlement(command: {
  orderId: string;
  settlementId: string;
  status: "settled" | "failed" | "on_hold";
  amount: number;
  settledAt: string | null;
}) {
  const payload: Json = {
    type: command.status,
    order_id: command.orderId,
    amount_paise: command.amount,
  };
  const { data, error } = await createServiceClient().rpc("apply_payout_settlement", {
    p_event_id: command.settlementId,
    p_order_id: command.orderId,
    p_status: command.status,
    p_split_ref: command.settlementId,
    p_amount: command.amount,
    p_settled_at: command.settledAt,
    p_payload: payload,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Payout status could not be saved.");
  const outcome = data as { outcome?: string; payout_id?: string; is_test?: boolean };
  if (outcome.outcome === "manual")
    console.info("Ignored a gateway settlement for a manual payout order.");
  if (
    command.status === "settled" &&
    outcome.payout_id &&
    outcome.is_test !== true &&
    (outcome.outcome === "settled" ||
      outcome.outcome === "duplicate" ||
      outcome.outcome === "unchanged")
  ) {
    try {
      await notifyPayoutSettled(outcome.payout_id);
    } catch {
      // The ledger is saved. A later delivery can claim the same email.
    }
  }
  return outcome.outcome ?? "ignored";
}
