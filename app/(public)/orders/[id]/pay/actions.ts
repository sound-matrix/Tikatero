"use server";
import { redirect } from "next/navigation";
import { ownOrder } from "@/lib/checkout/security";
import { transition } from "@/lib/checkout/store";
import { mockConfirmationAllowed } from "@/lib/payments/model";
export async function mockPayment(id: string, state: "paid" | "failed") {
  if (!["paid", "failed"].includes(state)) throw new Error("Invalid test payment.");
  const order = await ownOrder(id);
  if (!order || order.payment_provider !== "mock") throw new Error("Test order not found.");
  if (order.status !== "pending" || Date.parse(order.hold_expires_at ?? "") <= Date.now())
    redirect(`/orders/${id}/status`);
  if (state === "paid" && !mockConfirmationAllowed(process.env))
    throw new Error("Test payments are disabled in production.");
  await transition(order, { state, amount: order.total_paise, currency: "INR" });
  redirect(`/orders/${id}/status`);
}
