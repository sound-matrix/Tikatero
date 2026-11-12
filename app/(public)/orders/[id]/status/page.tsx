import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ownOrder } from "@/lib/checkout/security";
import { isOrderEventCancelled, reconcileOnDemand } from "@/lib/checkout/store";
import { createServiceClient } from "@/lib/supabase/service";
import { OrderStatusView } from "@/components/checkout/order-status";
import { sessionClient } from "@/lib/supabase/server";
import { CancelBooking } from "@/components/refunds/cancel-booking";
import { loadBuyerQuote } from "@/lib/refunds/read";
import { PAUSE_REQUEST } from "@/lib/refunds/rules";
import { loadOrderTickets } from "@/lib/tickets/load";
export const metadata = { title: "Order status", robots: { index: false, follow: false } };
type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ refund?: string; refund_error?: string }>;
};
async function Status({ params, searchParams }: Props) {
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
  const session = await sessionClient();
  const user = session && (await session.auth.getUser()).data.user;
  const guest = !user;
  const query = await searchParams;
  const decision =
    session && user && user.id === order.buyer_id && !cancelled
      ? await loadBuyerQuote(session, order.id)
      : null;
  return (
    <>
      <OrderStatusView
        guest={guest}
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
      {decision && (
        <section className="mx-auto max-w-2xl px-4 pb-10">
          {query.refund === "paused" && <p>{PAUSE_REQUEST}</p>}
          {query.refund === "requested" && <p>Your refund request is saved.</p>}
          {query.refund_error && (
            <p role="alert" className="text-danger">
              {query.refund_error}
            </p>
          )}
          <CancelBooking
            orderId={order.id}
            message={decision.message}
            canRequest={!!decision.quote}
            paused={decision.quote?.paused}
            fromOrder
          />
        </section>
      )}
    </>
  );
}
export default function Page(props: Props) {
  return (
    <Suspense fallback={<p className="p-8">Loading order…</p>}>
      <Status {...props} />
    </Suspense>
  );
}
