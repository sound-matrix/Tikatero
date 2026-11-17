import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { providerPaise } from "@/lib/payments/model";
import { PayU, payuVerifiedResponse } from "@/lib/payments/payu";
import { reconcile } from "@/lib/checkout/store";

// The browser callback and server webhook both use this verified path.
// Never trust callback status alone: reconciliation fetches PayU's authoritative status.
export async function acceptPayUNotification(request: Request): Promise<{ orderId: string | null; httpStatus: number }> {
  if (request.method !== "POST") return { orderId: null, httpStatus: 405 };
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 16_384) return { orderId: null, httpStatus: 413 };
  const raw = await request.text();
  if (raw.length > 16_384) return { orderId: null, httpStatus: 413 };
  const fields = Object.fromEntries(new URLSearchParams(raw));
  const key = process.env.PAYU_MERCHANT_KEY ?? "";
  const salt = process.env.PAYU_MERCHANT_SALT ?? "";
  if (!key || !salt || !payuVerifiedResponse(fields, key, salt))
    return { orderId: null, httpStatus: 401 };
  if (!fields.txnid || !/^[a-zA-Z0-9]{8,25}$/.test(fields.txnid))
    return { orderId: null, httpStatus: 400 };

  const service = createServiceClient();
  const { data: order, error } = await service.from("orders")
    .select("*").eq("payment_provider", "payu")
    .eq("payment_session_id", fields.txnid).maybeSingle();
  if (error) return { orderId: null, httpStatus: 503 };
  if (!order) return { orderId: null, httpStatus: 404 };
  if (order.payment_session_id !== fields.txnid ||
    fields.email?.toLowerCase() !== order.buyer_email.toLowerCase() ||
    fields.productinfo !== "Tikatero event tickets") return { orderId: null, httpStatus: 400 };
  let amount: number;
  try { amount = providerPaise(fields.amount); }
  catch { return { orderId: null, httpStatus: 400 }; }
  if (amount !== order.total_paise) return { orderId: null, httpStatus: 400 };
  try {
    await reconcile(order);
  } catch {
    // The reconciliation cron will retry if PayU is unavailable.
    return { orderId: order.id, httpStatus: 503 };
  }
  return { orderId: order.id, httpStatus: 200 };
}
