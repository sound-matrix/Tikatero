import "server-only";
import { platformPayments } from "@/lib/payments/settings";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureSplitVendor } from "@/lib/payouts/vendor";

/** Approval unlocks publishing. This also creates or reuses the Easy Split vendor. */
export async function onOrganiserApproved(organiserId: string): Promise<void> {
  const client = createServiceClient();
  const [{ data, error }, settings] = await Promise.all([
    client.from("organisers").select("payout_mode_override").eq("id", organiserId).single(),
    platformPayments(client),
  ]);
  if (error) throw new Error("Organiser could not be loaded.");
  if ((data.payout_mode_override ?? settings.payout_mode) === "gateway_split")
    await ensureSplitVendor(organiserId);
}
