import "server-only";
import { ensureSplitVendor } from "@/lib/payouts/vendor";

/** Approval unlocks publishing. This also creates or reuses the Easy Split vendor. */
export async function onOrganiserApproved(organiserId: string): Promise<void> {
  await ensureSplitVendor(organiserId);
}
