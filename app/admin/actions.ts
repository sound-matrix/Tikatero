"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/admin/access";
import { notifyAdminAction } from "@/lib/admin/notify";
import { onOrganiserApproved } from "@/lib/admin/approved";
import { uuid } from "@/lib/admin/model";
import { productionPaymentLock } from "@/lib/payments/model";
import {
  OWN_ORGANISER_CONTROL,
  organiserControlError,
  settlementHoldPlan,
} from "@/lib/payouts/model";
import { notifyPayoutHeld } from "@/lib/payouts/notify";
import { splitProvider } from "@/lib/payouts/provider";
export type ActionState = { error?: string; success?: string; notificationId?: string };
function text(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}
function refresh() {
  for (const path of [
    "/admin",
    "/admin/kyc",
    "/admin/accounts",
    "/admin/audit",
    "/admin/reconciliation",
    "/console",
  ])
    revalidatePath(path, "layout");
}
async function deliver(id: string): Promise<ActionState> {
  try {
    const result = await notifyAdminAction(id);
    if (!result || ["sent", "duplicate"].includes(result.status))
      return { success: "Saved. Notification sent." };
  } catch {
    /* State is committed; allow an idempotent email retry without reapplying it. */
  }
  return {
    success: "Saved. Email delivery needs attention. You can retry below.",
    notificationId: id,
  };
}
export async function reviewKyc(_state: ActionState, form: FormData): Promise<ActionState> {
  const { client } = await requireStaff();
  const id = text(form, "id"),
    decision = text(form, "decision"),
    revisionText = text(form, "revision"),
    revision = revisionText === "" ? null : Number(revisionText);
  if (
    !uuid(id) ||
    (revision !== null && (!Number.isSafeInteger(revision) || revision < 0)) ||
    !["approved", "rejected", "needs_docs"].includes(decision)
  )
    return { error: "Choose a valid review action." };
  const { data, error } = await client.rpc("admin_review_kyc", {
    p_id: id,
    p_revision: revision,
    p_decision: decision,
    p_steps: form.getAll("steps").filter((s): s is string => typeof s === "string"),
    p_note: text(form, "note").slice(0, 1000),
  });
  if (error || !data)
    return {
      error:
        error?.code === "40001"
          ? "This application changed. Reload before reviewing."
          : error?.message || "The decision could not be saved.",
    };
  let hookFailed = false;
  if (decision === "approved") {
    const { data: app } = await client
      .from("kyc_applications")
      .select("organiser_id")
      .eq("id", id)
      .single();
    try {
      if (app) await onOrganiserApproved(app.organiser_id);
    } catch {
      hookFailed = true;
    }
  }
  refresh();
  const result = await deliver(data);
  return hookFailed
    ? { ...result, success: `${result.success} Approval follow-up needs attention.` }
    : result;
}
export async function changeAccount(_state: ActionState, form: FormData): Promise<ActionState> {
  const { client } = await requireStaff();
  const id = text(form, "id"),
    action = text(form, "action"),
    reason = text(form, "reason");
  if (!uuid(id) || !["block", "suspend", "unblock"].includes(action))
    return { error: "Choose an account action." };
  if (action !== "unblock" && !reason) return { error: "A reason is required." };
  const { data, error } = await client.rpc("admin_account_action", {
    p_id: id,
    p_action: action,
    p_reason: reason.slice(0, 1000),
  });
  if (error || !data) return { error: error?.message || "The account could not be updated." };
  refresh();
  return action === "unblock" ? { success: "Account unblocked." } : deliver(data);
}
export async function changeControl(_state: ActionState, form: FormData): Promise<ActionState> {
  const { client, account } = await requireStaff();
  const id = text(form, "id"),
    control = text(form, "control"),
    enabled = text(form, "enabled");
  if (
    !uuid(id) ||
    !["payouts_on_hold", "sales_paused"].includes(control) ||
    !["true", "false"].includes(enabled)
  )
    return { error: "Choose an organiser control." };
  const [{ data: org, error: orgError }, { data: members, error: memberError }] = await Promise.all(
    [
      client
        .from("organisers")
        .select("id, owner_id, cashfree_vendor_id")
        .eq("id", id)
        .maybeSingle(),
      client.from("organiser_members").select("user_id").eq("organiser_id", id),
    ],
  );
  if (orgError || memberError || !org) return { error: "Organiser not found." };
  const own = organiserControlError(
    account.profile.id,
    org.owner_id,
    (members ?? []).flatMap((member) => (member.user_id ? [member.user_id] : [])),
  );
  if (own) return { error: own };
  let provider: "mock" | "cashfree" | "unconfigured" = "unconfigured";
  try {
    provider = splitProvider().mode;
  } catch {
    provider = "unconfigured";
  }
  const plan = settlementHoldPlan({
    control,
    vendorId: org.cashfree_vendor_id,
    productionLocked: productionPaymentLock(),
    provider,
  });
  if (plan === "refuse")
    return { error: "Payout controls need the payment service. Nothing was changed." };
  const hold = enabled === "true";
  if (plan === "call" && org.cashfree_vendor_id) {
    try {
      await splitProvider().setSettlementHold(org.cashfree_vendor_id, hold);
    } catch {
      return {
        error:
          "The payout hold could not be updated with the payment service. Nothing was changed.",
      };
    }
  }
  const { data, error } = await client.rpc("admin_organiser_control", {
    p_id: id,
    p_control: control,
    p_enabled: hold,
  });
  if (error || !data) {
    if (plan === "call" && org.cashfree_vendor_id) {
      try {
        await splitProvider().setSettlementHold(org.cashfree_vendor_id, !hold);
      } catch {
        return { error: "The payout hold needs attention. Please try again." };
      }
    }
    return {
      error: error?.message?.includes(OWN_ORGANISER_CONTROL)
        ? OWN_ORGANISER_CONTROL
        : error?.message || "The organiser could not be updated.",
    };
  }
  if (control === "payouts_on_hold" && hold) {
    try {
      await notifyPayoutHeld(id, data);
    } catch {
      refresh();
      return { success: "Organiser control saved. The on-hold email needs attention." };
    }
  }
  refresh();
  return { success: "Organiser control saved." };
}
export async function retryNotification(_state: ActionState, form: FormData): Promise<ActionState> {
  const { client } = await requireStaff();
  const id = text(form, "notificationId");
  if (!uuid(id)) return { error: "Choose a valid notification." };
  const { data } = await client.from("audit_log").select("id,action").eq("id", id).single();
  if (
    !data ||
    ![
      "kyc_approved",
      "kyc_rejected",
      "kyc_needs_docs",
      "account_block",
      "account_suspend",
    ].includes(data.action)
  )
    return { error: "Notification not found." };
  return deliver(id);
}
