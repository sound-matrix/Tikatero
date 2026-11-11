import "server-only";
import { matchThreshold } from "@/lib/kyc/model";
import { createServiceClient } from "@/lib/supabase/service";
import { LIVE_VENDOR_UNAVAILABLE, matchingKycName } from "./model";
import { splitProvider } from "./provider";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/** Create or reuse an Easy Split vendor after approval. Never logs bank details. */
export async function ensureSplitVendor(organiserId: string) {
  const service = createServiceClient();
  const { data: org, error } = await service
    .from("organisers")
    .select("id, legal_name, cashfree_vendor_id, kyc_status")
    .eq("id", organiserId)
    .single();
  if (error || !org) throw new Error("Organiser could not be loaded.");
  if (org.kyc_status !== "approved") throw new Error("Organiser is not approved.");
  if (org.cashfree_vendor_id) return org.cashfree_vendor_id;
  const { data: application, error: appError } = await service
    .from("kyc_applications")
    .select("pan_name, bank_holder_name, step_progress")
    .eq("organiser_id", organiserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (appError) throw new Error("Verification details could not be loaded.");
  const progress = asRecord(application?.step_progress);
  const bank = asRecord(progress.bank);
  const pan = asRecord(progress.pan);
  const details = asRecord(progress.details);
  const bankName = text(application?.bank_holder_name) || text(bank.name);
  const kycName =
    text(org.legal_name) ||
    text(application?.pan_name) ||
    text(pan.name) ||
    text(details.legalName);
  let threshold = 85;
  try {
    threshold = matchThreshold(process.env.KYC_NAME_MATCH_THRESHOLD);
  } catch {
    throw new Error("Verification settings need attention. Please contact support.");
  }
  if (!matchingKycName(bankName, kycName, threshold))
    throw new Error("The bank account name does not match the organiser name.");
  let provider;
  try {
    provider = splitProvider();
  } catch {
    throw new Error(LIVE_VENDOR_UNAVAILABLE);
  }
  if (provider.mode !== "mock") {
    await provider.ensureVendor(organiserId);
    throw new Error(LIVE_VENDOR_UNAVAILABLE);
  }
  const created = await provider.ensureVendor(organiserId);
  if (!created.vendorId.startsWith("mock_vendor_")) throw new Error(LIVE_VENDOR_UNAVAILABLE);
  const { error: saveError } = await service
    .from("organisers")
    .update({ cashfree_vendor_id: created.vendorId })
    .eq("id", organiserId)
    .is("cashfree_vendor_id", null);
  if (saveError) throw new Error("The payout account could not be saved.");
  return created.vendorId;
}
