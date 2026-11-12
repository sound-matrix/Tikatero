"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { sweepAvatarCleanup } from "@/lib/account/avatar-store";
import { redirect } from "next/navigation";
import { requireAccount } from "@/lib/auth/account";
import { allowRequest } from "@/lib/security/rate-limit";
import { parseHundredths } from "@/lib/pricing/settings";
import { settleOpenedRefund, type OpenedRefund } from "./complete";
import { notifyRefundRejected } from "./notify";
import { sweepEventRefunds } from "./event-refunds";
import { ruleSettingsSchema } from "@/lib/events/validation";
import { rulesFromEditor } from "./rules";
import { requireStaff } from "@/lib/admin/access";

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
  await settleOpenedRefund(opened, true);
}

const REFUND_LIMIT = "Too many refund attempts. Please wait 10 minutes and try again.";

async function refundAllowed(userId: string) {
  return allowRequest("refund", userId, 20, 600);
}

export async function requestBuyerRefund(formData: FormData) {
  const { client, account } = await requireAccount();
  const orderId = uuid(formData.get("order_id"));
  if (!orderId) redirect("/me?refund_error=Choose%20a%20booking.");
  const back = formData.get("from_order") === "yes" ? `/orders/${orderId}/status` : "/me";
  if (!(await refundAllowed(account.profile.id)))
    redirect(`${back}?refund_error=${encodeURIComponent(REFUND_LIMIT)}`);
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
      `${back}?refund_error=${encodeURIComponent(dbMessage(error, "That refund could not be requested."))}`,
    );
  try {
    await settle((data ?? {}) as OpenedRefund);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "The refund could not be completed.";
    redirect(`${back}?refund_error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/me");
  if (back !== "/me") revalidatePath(back);
  redirect(`${back}?refund=${(data as OpenedRefund)?.paused ? "paused" : "requested"}`);
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
  let amount: number | null = null;
  const input = String(formData.get("amount_rupees") ?? "").trim();
  if (action === "approve" && input) {
    try {
      amount = parseHundredths(input);
    } catch {
      redirect(
        `${back}?refund_error=${encodeURIComponent("Enter the refund in rupees, including GST.")}`,
      );
    }
  }
  const { data, error } = await client.rpc("refund_action", {
    p_action: action,
    p_order_id: null,
    p_refund_id: refundId,
    p_amount: amount,
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
    const opened = (data ?? {}) as OpenedRefund;
    if (action === "reject") after(() => notifyRefundRejected(refundId).catch(() => null));
    else await settle(opened);
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

export async function deleteMyAccount(
  _previous: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const { client, account } = await requireAccount();
  if (formData.get("confirm_delete") !== "yes") {
    return { error: "Tick the box to confirm you want to delete your account." };
  }
  const { error } = await client.rpc("delete_my_account");
  if (error) return { error: dbMessage(error, "Your account could not be deleted.") };
  after(() => sweepAvatarCleanup(account.profile.id).catch(() => {}));
  await client.auth.signOut();
  redirect("/login");
}

export async function saveAdminRefundRules(formData: FormData) {
  const { client, account } = await requireStaff();
  const eventId = uuid(formData.get("event_id"));
  if (!eventId || account.profile.role !== "admin") redirect("/admin/events");
  const back = `/admin/events/${eventId}`;
  let rules;
  try {
    rules = rulesFromEditor(
      ruleSettingsSchema.parse(JSON.parse(String(formData.get("refund_settings") ?? ""))),
    );
  } catch (error) {
    const message =
      error instanceof Error && error.name !== "ZodError" && error.name !== "SyntaxError"
        ? error.message
        : "Check your refund rules.";
    redirect(`${back}?refund_error=${encodeURIComponent(message)}#refund-settings`);
  }
  const { error } = await client.rpc("admin_save_refund_rules", {
    p_event_id: eventId,
    p_policy: rules.refund_policy,
    p_rules: rules.refund_rules,
    p_auto: rules.refund_auto_approve,
    p_reason: String(formData.get("reason") ?? ""),
  });
  if (error)
    redirect(
      `${back}?refund_error=${encodeURIComponent(dbMessage(error, "The refund rules could not be saved."))}#refund-settings`,
    );
  revalidatePath(back);
  redirect(`${back}?refund=rules#refund-settings`);
}

export async function setRefundPause(formData: FormData) {
  const { client, account } = await requireStaff();
  const scope = formData.get("event_id");
  const eventId = uuid(scope);
  if ((scope && !eventId) || account.profile.role !== "admin") redirect("/admin");
  const back = eventId ? `/admin/events/${eventId}` : "/admin/settings";
  const pause = formData.get("pause") === "yes";
  const { error } = await client.rpc("admin_pause_refunds", {
    p_event_id: eventId,
    p_pause: pause,
    p_reason: String(formData.get("reason") ?? ""),
  });
  if (error)
    redirect(
      `${back}?refund_error=${encodeURIComponent(dbMessage(error, "The pause could not be changed."))}#refund-settings`,
    );
  if (!pause) after(() => sweepEventRefunds().catch(() => null));
  revalidatePath("/admin", "layout");
  redirect(`${back}?refund=pause#refund-settings`);
}
