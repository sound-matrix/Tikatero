import { ownOrder } from "@/lib/checkout/security";
import { reconcile } from "@/lib/checkout/store";
import { createServiceClient } from "@/lib/supabase/service";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const order = await ownOrder((await params).id);
  if (!order) return new Response(null, { status: 404 });
  let status: string = order.status;
  if (!order.reconciled_at || Date.now() - Date.parse(order.reconciled_at) > 10000) {
    try {
      status = await reconcile(order);
    } catch {
      /* Retry on next poll; no provider data in responses/logs. */
    }
  }
  const { data: review, error } = await createServiceClient()
    .from("order_outbox")
    .select("id")
    .eq("order_id", order.id)
    .eq("topic", "payment.review_required")
    .maybeSingle();
  if (error) return new Response(null, { status: 503 });
  return Response.json(
    {
      id: order.id,
      status,
      total: order.total_paise,
      isTest: order.is_test,
      review: !!review,
      canPay: !!order.payment_session_id && Date.parse(order.hold_expires_at ?? "") > Date.now(),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
