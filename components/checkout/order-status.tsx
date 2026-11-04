"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { publicPrice } from "@/lib/discovery/model";
export type OrderStatus = {
  id: string;
  status: string;
  total: number;
  isTest: boolean;
  review: boolean;
  canPay: boolean;
};
export function OrderStatusView({ initial }: { initial: OrderStatus }) {
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
  const title = order.review
    ? "Payment needs review"
    : order.status === "paid"
      ? "Booking confirmed"
      : ["failed", "expired"].includes(order.status)
        ? "Booking not completed"
        : "Checking your payment";
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
      <p className="mt-4 text-muted">
        {order.review
          ? "Your payment arrived after the seats were reallocated. Please contact support with your order number."
          : order.status === "paid"
            ? "Your booking is confirmed. Keep this order number for your records."
            : ["failed", "expired"].includes(order.status)
              ? "Your seats have been released. You can start a new booking."
              : "Please wait while we confirm your payment. Do not pay again."}
      </p>
      {error && (
        <p role="status" className="mt-4 text-muted">
          {error}
        </p>
      )}
      {order.canPay && order.status === "pending" && (
        <Link
          className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-linear-to-r from-coral to-orange px-5 font-bold"
          href={`/orders/${order.id}/pay`}
        >
          Continue payment
        </Link>
      )}
      <Link className="mt-6 block underline" href="/events">
        Browse events
      </Link>
    </main>
  );
}
