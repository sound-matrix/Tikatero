import "server-only";
/** PR 14 will provision the payout vendor here. Approval already unlocks publishing via PR 2. */
export async function onOrganiserApproved(organiserId: string): Promise<void> {
  void organiserId;
}
