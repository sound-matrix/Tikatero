"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount } from "@/lib/auth/account";
import { allowRequest } from "@/lib/security/rate-limit";
import { parseHundredths } from "@/lib/pricing/settings";
import { createServiceClient } from "@/lib/supabase/service";
import { settleOpenedRefund, type OpenedRefund } from "./complete";
import { notifyEventCancelled } from "./notify";
import { PAYMENTS_REFUND_UNAVAILABLE, refundRoute } from "./model";

function dbMessage(error: { message?: string } | null, fallback: string) {
  const line = (error?.message ?? "").split("\n")[0].replace(/^.*ERROR:\s*/i, "");
  if (!line || line.length > 240 || /secret|password|vendor_id|stack/i.test(line)) return fallback;
  return line;
}

function uuid(value: FormDataEntryValue | null) {
  const text = String(value ?? "");
  return /^[0-9a-f-]{36}$/i.test(text) ? text : null;
}

async function settle(opened: OpenedRefund) {
  if (!opened.needs_provider) return;
  await settleOpenedRefund(opened);
}

const REFUND_LIMIT = "Too many refund attempts. Please wait 10 minutes and try again.";

async function refundAllowed(userId: string) {
  return allowRequest("refund", userId, 20, 600);
}

export async function requestBuyerRefund(formData: FormData) {
  const { client, account } = await requireAccount();
  if (!(await refundAllowed(account.profile.id)))
    redirect(`/me?refund_error=${encodeURIComponent(REFUND_LIMIT)}`);
  const orderId = uuid(formData.get("order_id"));
  if (!orderId) redirect("/me?refund_error=Choose%20a%20booking.");
  const { data, error } = await client.rpc("refund_action", {
    p_action: "request",
    p_order_id: orderId,
    p_refund_id: null,
    p_amount: null,
    p_ticket_ids: null,
    p_reason: "Buyer request",
    p_as: "organiser",
    p_confirm: false,
  });
  if (error)
    redirect(
      `/me?refund_error=${encodeURIComponent(dbMessage(error, "That refund could not be requested."))}`,
    );
  try {
    await settle((data ?? {}) as OpenedRefund);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "The refund could not be completed.";
    redirect(`/me?refund_error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/me");
  redirect("/me?refund=updated");
}

export async function reviewRefund(formData: FormData) {
  const { client, account } = await requireAccount();
  const refundId = uuid(formData.get("refund_id"));
  const eventId = uuid(formData.get("event_id"));
  const action = formData.get("decision") === "reject" ? "reject" : "approve";
  const asStaff = formData.get("as") === "staff";
  const back = asStaff ? `/admin/events/${eventId}` : `/console/events/${eventId}`;
  if (!refundId || !eventId) redirect("/console");
  if (!(await refundAllowed(account.profile.id)))
    redirect(`${back}?refund_error=${encodeURIComponent(REFUND_LIMIT)}`);
  const { data, error } = await client.rpc("refund_action", {
    p_action: action,
    p_order_id: null,
    p_refund_id: refundId,
    p_amount: null,
    p_ticket_ids: null,
    p_reason: String(formData.get("reason") ?? "").slice(0, 300),
    p_as: asStaff ? "staff" : "organiser",
    p_confirm: formData.get("confirm_own") === "yes",
  });
  if (error)
    redirect(
      `${back}?refund_error=${encodeURIComponent(dbMessage(error, "That refund could not be updated."))}`,
    );
  try {
    await settle((data ?? {}) as OpenedRefund);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "The refund could not be completed.";
    redirect(`${back}?refund_error=${encodeURIComponent(message)}`);
  }
  revalidatePath(back);
  redirect(`${back}?refund=updated`);
}

export async function issueRefund(formData: FormData) {
  const { client, account } = await requireAccount();
  const orderId = uuid(formData.get("order_id"));
  const eventId = uuid(formData.get("event_id"));
  const asStaff = formData.get("as") === "staff";
  const back = asStaff ? `/admin/events/${eventId}` : `/console/events/${eventId}`;
  if (!orderId || !eventId) redirect("/console");
  if (!(await refundAllowed(account.profile.id)))
    redirect(`${back}?refund_error=${encodeURIComponent(REFUND_LIMIT)}`);
  let amount: number;
  try {
    amount = parseHundredths(String(formData.get("amount_rupees") ?? ""));
  } catch {
    redirect(
      `${back}?refund_error=${encodeURIComponent("Enter the refund in rupees, including GST.")}`,
    );
  }
  const ticketIds = formData
    .getAll("ticket_id")
    .map((value) => String(value))
    .filter((value) => /^[0-9a-f-]{36}$/i.test(value));
  const { data, error } = await client.rpc("refund_action", {
    p_action: "issue",
    p_order_id: orderId,
    p_refund_id: null,
    p_amount: amount,
    p_ticket_ids: ticketIds,
    p_reason: String(formData.get("reason") ?? "").slice(0, 300),
    p_as: asStaff ? "staff" : "organiser",
    p_confirm: formData.get("confirm_own") === "yes",
  });
  if (error)
    redirect(
      `${back}?refund_error=${encodeURIComponent(dbMessage(error, "That refund could not be issued."))}`,
    );
  try {
    await settle((data ?? {}) as OpenedRefund);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "The refund could not be completed.";
    redirect(`${back}?refund_error=${encodeURIComponent(message)}`);
  }
  revalidatePath(back);
  redirect(`${back}?refund=updated`);
}

function paymentsReady(isTest: boolean) {
  return (
    refundRoute(
      {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL_ENV: process.env.VERCEL_ENV,
        CASHFREE_ENV: process.env.CASHFREE_ENV,
        PAYMENTS_ALLOW_MOCK: process.env.PAYMENTS_ALLOW_MOCK,
        hasCredentials: Boolean(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY),
      },
      isTest,
    ) !== "refuse"
  );
}

export async function cancelEventRefunds(formData: FormData) {
  const { client, account } = await requireAccount();
  const eventId = uuid(formData.get("event_id"));
  const asStaff = formData.get("as") === "staff";
  const back = asStaff ? `/admin/events/${eventId}` : `/console/events/${eventId}`;
  if (!eventId) redirect("/console");
  if (!(await refundAllowed(account.profile.id)))
    redirect(`${back}?refund_error=${encodeURIComponent(REFUND_LIMIT)}`);
  const reason = String(formData.get("reason") ?? "")
    .trim()
    .slice(0, 300);
  if (!reason)
    redirect(
      `${back}?refund_error=${encodeURIComponent("Add a short reason for the cancellation.")}`,
    );
  const { data: rows, error: listError } = await client
    .from("orders")
    .select("is_test, status")
    .eq("event_id", eventId)
    .in("status", ["paid", "partially_refunded"]);
  if (listError)
    redirect(`${back}?refund_error=${encodeURIComponent("This event could not be cancelled.")}`);
  if ((rows ?? []).some((row) => !paymentsReady(row.is_test))) {
    redirect(`${back}?refund_error=${encodeURIComponent(PAYMENTS_REFUND_UNAVAILABLE)}`);
  }
  const { data, error } = await client.rpc("cancel_event_refunds", {
    p_event_id: eventId,
    p_reason: reason,
    p_as: asStaff ? "staff" : "organiser",
    p_confirm: formData.get("confirm_own") === "yes",
  });
  if (error)
    redirect(
      `${back}?refund_error=${encodeURIComponent(dbMessage(error, "This event could not be cancelled."))}`,
    );
  const payload = (data ?? {}) as { refunds?: OpenedRefund[] };
  try {
    for (const opened of payload.refunds ?? []) await settle(opened);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "A refund could not be completed.";
    redirect(`${back}?refund_error=${encodeURIComponent(message)}`);
  }
  const service = createServiceClient();
  const { data: event } = await service
    .from("events")
    .select("title")
    .eq("id", eventId)
    .maybeSingle();
  const { data: buyers } = await service
    .from("orders")
    .select("buyer_email, buyer_name")
    .eq("event_id", eventId)
    .in("status", ["paid", "refunded", "partially_refunded"]);
  const seen = new Set<string>();
  for (const buyer of buyers ?? []) {
    const email = buyer.buyer_email.toLowerCase();
    if (seen.has(email) || email.endsWith("@users.invalid")) continue;
    seen.add(email);
    try {
      await notifyEventCancelled({
        eventId,
        eventTitle: event?.title || "Your event",
        buyerEmail: buyer.buyer_email,
        buyerName: buyer.buyer_name,
        reason,
      });
    } catch {
      // The cancellation is saved.
    }
  }
  revalidatePath(back);
  redirect(`${back}?refund=updated`);
}

export async function openAdminEvent(formData: FormData) {
  const { account } = await requireAccount();
  if (!["staff", "admin"].includes(account.profile.role)) redirect("/me");
  const eventId = uuid(formData.get("event_id"));
  if (!eventId) redirect("/admin/events");
  redirect(`/admin/events/${eventId}`);
}

export async function deleteMyAccount(
  _previous: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const { client } = await requireAccount();
  if (formData.get("confirm_delete") !== "yes") {
    return { error: "Tick the box to confirm you want to delete your account." };
  }
  const { error } = await client.rpc("delete_my_account");
  if (error) return { error: dbMessage(error, "Your account could not be deleted.") };
  await client.auth.signOut();
  redirect("/login");
}
