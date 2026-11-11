import "server-only";

import { Cashfree } from "@/lib/payments/cashfree";
import { MockPayment } from "@/lib/payments/mock";
import { createServiceClient } from "@/lib/supabase/service";
import { PAYMENTS_REFUND_UNAVAILABLE, refundRoute, type RefundRoute } from "./model";
import { notifyRefundProcessed } from "./notify";

export type OpenedRefund = {
  outcome?: string;
  refund_id?: string;
  order_id?: string;
  event_id?: string;
  amount_paise?: number;
  reversal_paise?: number;
  needs_provider?: boolean;
  is_test?: boolean;
};

function currentRoute(isTest: boolean): RefundRoute {
  return refundRoute(
    {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
      CASHFREE_ENV: process.env.CASHFREE_ENV,
      PAYMENTS_ALLOW_MOCK: process.env.PAYMENTS_ALLOW_MOCK,
      hasCredentials: Boolean(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY),
    },
    isTest,
  );
}

async function finish(
  refundId: string,
  cfRefundId: string,
  outcome: "processed" | "pending" | "failed",
) {
  const { data, error } = await createServiceClient().rpc("finish_refund", {
    p_refund_id: refundId,
    p_cf_refund_id: cfRefundId,
    p_outcome: outcome,
  });
  if (error) throw new Error("The refund could not be saved.");
  return data;
}

export async function settleOpenedRefund(opened: OpenedRefund) {
  if (!opened.needs_provider || !opened.refund_id || !opened.order_id) return opened;
  const route = currentRoute(opened.is_test === true);
  if (route === "refuse") {
    await finish(opened.refund_id, "", "failed");
    throw new Error(PAYMENTS_REFUND_UNAVAILABLE);
  }
  const service = createServiceClient();
  const { data: order, error } = await service
    .from("orders")
    .select("id, cf_order_id, vendor_id, is_test")
    .eq("id", opened.order_id)
    .single();
  if (error || !order) {
    await finish(opened.refund_id, "", "failed");
    throw new Error("The refund could not be saved.");
  }
  const reversal = opened.reversal_paise ?? 0;
  if (route === "cashfree" && reversal > 0 && !order.vendor_id) {
    await finish(opened.refund_id, "", "failed");
    throw new Error("This organiser is not ready to refund yet.");
  }
  const provider = route === "mock" ? new MockPayment() : new Cashfree();
  try {
    const result = await provider.refund({
      refundId: opened.refund_id,
      orderId: order.cf_order_id || order.id,
      amountPaise: opened.amount_paise ?? 0,
      reversalPaise: reversal,
      vendorId: order.vendor_id,
      note: "Refund to the original payment method",
    });
    const saved = await finish(opened.refund_id, result.cfRefundId, result.status);
    if (result.status === "failed")
      throw new Error("The refund did not go through. Please try again.");
    if (result.status === "processed") {
      try {
        await notifyRefundProcessed(opened.refund_id, route === "mock" || order.is_test);
      } catch {
        // The refund is saved. A later send can claim the same email.
      }
    }
    return saved;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "The refund did not go through. Please try again."
    )
      throw error;
    try {
      await finish(opened.refund_id, "", "failed");
    } catch {
      // The open refund stays approved so a webhook can still finish it.
    }
    if (error instanceof Error && error.message === "This organiser is not ready to refund yet.")
      throw error;
    throw new Error("The refund could not be completed. Please try again.");
  }
}

export async function applyRefundWebhook(command: {
  refundId: string;
  amountPaise: number;
  cfRefundId: string;
  outcome: "processed" | "pending" | "failed";
}) {
  const service = createServiceClient();
  const { data: refund, error } = await service
    .from("refunds")
    .select("id, amount_paise, status, order_id")
    .eq("id", command.refundId)
    .maybeSingle();
  if (error) throw new Error("Refund status could not be saved.");
  if (!refund || refund.amount_paise !== command.amountPaise) {
    throw new Error("invalid");
  }
  const { data: order } = await service
    .from("orders")
    .select("is_test")
    .eq("id", refund.order_id)
    .maybeSingle();
  await finish(command.refundId, command.cfRefundId, command.outcome);
  if (command.outcome === "processed") {
    try {
      await notifyRefundProcessed(command.refundId, order?.is_test === true);
    } catch {
      // Saved. Email can be claimed again.
    }
  }
}
