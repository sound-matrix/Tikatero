"use server";

import { requireAccount } from "@/lib/auth/account";
import { uuid } from "@/lib/admin/model";
import { kycProvider } from "@/lib/kyc";
import { matchThreshold } from "@/lib/kyc/model";
import { encryptBankNumber } from "@/lib/payouts/bank";
import { allowRequest } from "@/lib/security/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";
import type { ActionState } from "@/app/admin/actions";

export async function reverifyPayoutBank(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { account } = await requireAccount();
  const host = String(form.get("host") ?? "");
  const number = String(form.get("number") ?? "").replace(/\s/g, "");
  const ifsc = String(form.get("ifsc") ?? "")
    .trim()
    .toUpperCase();
  if (!uuid(host) || !/^\d{6,20}$/.test(number) || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc))
    return { error: "Check the host, account number and IFSC." };
  if (!(await allowRequest("reverify-payout-bank", account.profile.id, 5, 3600)))
    return { error: "Too many attempts. Try again in an hour." };
  const service = createServiceClient();
  const [{ data: organiser }, { data: bank }] = await Promise.all([
    service
      .from("organisers")
      .select("id, legal_name")
      .eq("id", host)
      .eq("owner_id", account.profile.id)
      .eq("kyc_status", "approved")
      .maybeSingle(),
    service
      .from("kyc_applications")
      .select("id, bank_ifsc, bank_acct_last4, pan_name")
      .eq("organiser_id", host)
      .eq("status", "approved")
      .eq("region", "IN")
      .order("decided_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id")
      .limit(1)
      .maybeSingle(),
  ]);
  if (!organiser || !bank || bank.bank_ifsc !== ifsc || bank.bank_acct_last4 !== number.slice(-4))
    return { error: "Enter the bank account you used for verification." };
  const name = organiser.legal_name || bank.pan_name;
  if (!name) return { error: "Contact support to confirm your bank account." };
  try {
    const provider = kycProvider();
    if (provider.mode === "mock" && process.env.CASHFREE_ENV === "production")
      return { error: "Bank verification is temporarily unavailable." };
    const check = await provider.bank(number, ifsc, name);
    if (!check.passed || (check.score ?? 0) < matchThreshold(process.env.KYC_NAME_MATCH_THRESHOLD))
      return { error: "The bank account could not be verified." };
    const { error } = await service.rpc("store_reverified_payout_bank", {
      p_user_id: account.profile.id,
      p_organiser: host,
      p_application: bank.id,
      p_ifsc: ifsc,
      p_last4: number.slice(-4),
      p_mode: provider.mode,
      p_encrypted_number: encryptBankNumber(number, host),
    });
    if (error) throw new Error("Bank verification unavailable.");
    return { success: "Bank details confirmed for your payments." };
  } catch {
    return { error: "The bank account could not be saved. Please try again." };
  }
}
