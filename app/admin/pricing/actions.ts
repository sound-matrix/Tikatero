"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/admin/access";
import { parseSettings } from "@/lib/pricing/settings";
import type { PricingVersion } from "@/lib/pricing";
export type PricingState = { error?: string; success?: string; version?: PricingVersion };
export async function savePricing(_state: PricingState, form: FormData): Promise<PricingState> {
  const { client } = await requireStaff();
  const { data: versions, error: readError } = await client.rpc("active_pricing_version");
  if (readError || !versions?.[0]) return { error: "Pricing could not be loaded. Try again." };
  let draft: PricingVersion;
  try {
    draft = parseSettings(
      Object.fromEntries(
        ["platform_pct", "fixed_fee", "gateway_mode", "gateway_pct", "payout_days"].map((key) => [
          key,
          String(form.get(key) ?? ""),
        ]),
      ),
      versions[0],
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Check the pricing settings." };
  }
  const { data: id, error } = await client.rpc("admin_save_pricing_version", {
    p_platform_pct: draft.platform_pct,
    p_fixed_fee_paise: draft.fixed_fee_paise,
    p_gateway_mode: draft.gateway_mode,
    p_gateway_bps: draft.gateway_bps,
    p_payout_days: draft.payout_days,
  });
  if (error || !id) return { error: "Pricing could not be saved. Try again." };
  const { data: saved } = await client.from("pricing_versions").select("*").eq("id", id).single();
  revalidatePath("/admin/pricing");
  revalidatePath("/");
  revalidatePath("/console/events", "layout");
  return {
    success: "Saved — applies to new orders. Existing orders keep their pricing version.",
    version: saved ?? { ...draft, id },
  };
}
