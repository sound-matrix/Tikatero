import "server-only";
import { paymentDate } from "./earnings";
import { send } from "@/lib/email/send";
import { createServiceClient } from "@/lib/supabase/service";

async function ownerEmail(organiserId: string) {
  const service = createServiceClient();
  const { data: org, error } = await service
    .from("organisers")
    .select("owner_id, display_name")
    .eq("id", organiserId)
    .single();
  if (error || !org) throw new Error("Organiser could not be loaded.");
  const { data, error: userError } = await service.auth.admin.getUserById(org.owner_id);
  if (userError || !data.user?.email) throw new Error("This account has no email address.");
  return { email: data.user.email, name: org.display_name };
}

export async function notifyPayoutHeld(organiserId: string, auditId: string, manualBalance = 0) {
  const service = createServiceClient();
  const { data: rows, error } = await service
    .from("payouts")
    .select("amount_paise, is_test, status")
    .eq("organiser_id", organiserId)
    .eq("status", "on_hold")
    .eq("is_test", false);
  if (error) throw new Error("Payouts could not be loaded.");
  const amountPaise = (rows ?? []).reduce((sum, row) => sum + row.amount_paise, manualBalance);
  if (amountPaise <= 0) return null;
  const owner = await ownerEmail(organiserId);
  return send({
    template: "payout_on_hold",
    entityRef: `payout-hold/${auditId}`,
    to: owner.email,
    data: { organiserName: owner.name, amountPaise, actionPath: "/console/payouts" },
  });
}

export async function notifyPayoutSettled(payoutId: string) {
  const service = createServiceClient();
  const { data: payout, error } = await service
    .from("payouts")
    .select(
      "id, organiser_id, amount_paise, is_test, status, cf_split_ref, bank_reference, bank_last4, paid_on, method, voided_at",
    )
    .eq("id", payoutId)
    .maybeSingle();
  if (
    error ||
    !payout ||
    payout.status !== "settled" ||
    payout.voided_at ||
    (payout.is_test && !payout.method)
  )
    return null;
  const owner = await ownerEmail(payout.organiser_id);
  return send({
    template: "payout_settled",
    entityRef: `payout/${payout.id}/settled`,
    to: owner.email,
    logOnly: payout.is_test,
    data: {
      organiserName: owner.name,
      payoutRef: payout.bank_reference || payout.cf_split_ref || payout.id,
      ...(payout.paid_on && payout.bank_last4
        ? {
            bankLast4: payout.bank_last4,
            paidOn: paymentDate({ ...payout, event_title: null, settled_at: null }),
            isTest: payout.is_test,
          }
        : {}),
      amountPaise: payout.amount_paise,
      actionPath: "/console/payouts",
    },
  });
}
