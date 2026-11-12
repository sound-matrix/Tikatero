import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

// Stable ID makes a repeated completion harmless; the existing trigger creates
// the owner membership in the same transaction.
export function createDraftOrganiser(
  client: SupabaseClient<Database>,
  profileId: string,
  displayName: string,
) {
  return client.from("organisers").insert({
    id: profileId,
    owner_id: profileId,
    slug: `organiser-${profileId}`,
    display_name: displayName,
    kyc_status: "draft",
  });
}
