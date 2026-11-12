"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { publicPrice } from "@/lib/discovery/model";
export type OrderStatus = {
  id: string;
  status: string;
  total: number;
  isTest: boolean;
  review: boolean;
  cancelled?: boolean;
  canPay: boolean;
  tickets: { href: string; label: string }[];
};
export function OrderStatusView({ initial, guest }: { initial: OrderStatus; guest: boolean }) {
  const [order, setOrder] = useState(initial);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!["created", "pending"].includes(order.status)) return;
    const controller = new AbortController();
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/orders/${order.id}/status/poll`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        setOrder(await response.json());
        setError("");
      } catch {
        if (!controller.signal.aborted)
          setError("We’re still checking. You can safely refresh this page.");
      }
    }, 3000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [order.id, order.status]);
  let title = "Checking your payment";
  let message = "Please wait while we confirm your payment. Do not pay again.";
  if (order.status === "refunded") {
    title = "Booking refunded";
    message = "The refund was sent to the original payment method.";
  } else if (order.cancelled) {
    title = "Event cancelled";
    message =
      order.total > 0 && ["paid", "partially_refunded"].includes(order.status)
        ? "Your full refund is being processed."
        : "Your booking is no longer available.";
  } else if (order.status === "partially_refunded") {
    title = "Booking partly refunded";
    message = "A partial refund was sent to the original payment method.";
  } else if (order.review) {
    title = "Payment needs review";
    message = "Please contact support with your order number so we can check your payment.";
  } else if (order.status === "paid") {
    title = "Booking confirmed";
    message = order.tickets.length
      ? "Your tickets are ready below. A copy is on its way to your email."
      : "Your tickets are being prepared. Refresh this page in a moment.";
  } else if (["failed", "expired"].includes(order.status)) {
    title = "Booking not completed";
    message = "Your seats have been released. You can start a new booking.";
  }
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <p className="text-sm text-muted">Order {order.id}</p>
      <h1 className="mt-4 text-3xl font-extrabold" aria-live="polite">
        {title}
      </h1>
      {order.isTest && (
        <p className="mt-5 rounded-xl bg-gold-soft p-4 font-bold text-gold-ink">
          Test mode — no real money
        </p>
      )}
      <p className="mt-5 text-xl font-bold">{publicPrice(order.total)}</p>
      <p className="mt-4 text-muted">{message}</p>
      {error && (
        <p role="status" className="mt-4 text-muted">
          {error}
        </p>
      )}
      {!order.cancelled && order.status === "paid" && order.tickets.length > 0 && (
        <ul className="mt-6 space-y-3">
          {order.tickets.map((ticket) => (
            <li key={ticket.href}>
              <Link
                className="inline-flex min-h-12 items-center rounded-xl bg-linear-to-r from-coral to-orange px-5 font-bold text-white"
                href={ticket.href}
              >
                {ticket.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!order.cancelled && order.canPay && order.status === "pending" && (
        <Link
          className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-linear-to-r from-coral to-orange px-5 font-bold"
          href={`/orders/${order.id}/pay`}
        >
          Continue payment
        </Link>
      )}
      {guest && !order.cancelled && order.status === "paid" && (
        <aside className="mt-6 space-y-3 rounded-xl border border-line p-4">
          <p className="text-sm text-muted">Save these details for next time?</p>
          <Button href={`/orders/${order.id}/signup`} prefetch={false}>
            Create an account with this email
          </Button>
        </aside>
      )}
      <Link className="mt-6 block underline" href="/events">
        Browse events
      </Link>
    </main>
  );
}
