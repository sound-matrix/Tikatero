import "server-only";
import { connection } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";
import { launchPricing, type PricingVersion } from ".";
/** Request fresh: a saved version is reflected by the very next calculation. */
export async function activePricing(): Promise<PricingVersion> {
  await connection();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return launchPricing;
  const { data, error } = await createAnonClient().rpc("active_pricing_version");
  if (error || !data?.[0]) throw new Error("Pricing could not be loaded. Please try again.");
  return data[0];
}
