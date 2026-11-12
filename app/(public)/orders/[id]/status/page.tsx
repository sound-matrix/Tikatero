import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ownOrder } from "@/lib/checkout/security";
import { isOrderEventCancelled, reconcileOnDemand } from "@/lib/checkout/store";
import { createServiceClient } from "@/lib/supabase/service";
import { OrderStatusView } from "@/components/checkout/order-status";
import { loadOrderTickets } from "@/lib/tickets/load";
export const metadata = { title: "Order status", robots: { index: false, follow: false } };
async function Status({ params }: { params: Promise<{ id: string }> }) {
  const order = await ownOrder((await params).id);
  if (!order) notFound();
  const status = await reconcileOnDemand(order);
  const cancelled = await isOrderEventCancelled(order.event_id);
  const { data: review, error } = await createServiceClient()
    .from("order_outbox")
    .select("id")
    .eq("order_id", order.id)
    .eq("topic", "payment.review_required")
    .maybeSingle();
  if (error) throw new Error("Your order status could not be loaded.");
  return (
    <OrderStatusView
      initial={{
        id: order.id,
        status,
        total: order.total_paise,
        isTest: order.is_test,
        review: !!review,
        cancelled,
        canPay: !!order.payment_session_id,
        tickets: !cancelled && status === "paid" ? await loadOrderTickets(order.id) : [],
      }}
    />
  );
}
export default function Page(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="p-8">Loading order…</p>}>
      <Status {...props} />
    </Suspense>
  );
}
