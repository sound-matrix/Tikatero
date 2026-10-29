import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import type { Account } from "@/lib/auth/routing";
import { UploadError, type UploadInput } from "./policy";

export function requireActiveAccount(account: Account | null): asserts account is Account {
  if (!account) throw new UploadError("Please sign in to continue.", 401);
  if (account.profile.blocked_at)
    throw new UploadError("Your account is blocked. Please contact support.", 403);
}

export async function requireUploadMembership(
  client: SupabaseClient<Database>,
  account: Account,
  input: UploadInput,
) {
  requireActiveAccount(account);
  let organiserId = input.entityId;
  if (input.kind === "poster" || input.kind === "guest_photo") {
    const { data, error } = await client
      .from("events")
      .select("organiser_id")
      .eq("id", input.entityId)
      .maybeSingle();
    if (error) throw new Error("Event access could not be checked.");
    if (!data) throw new UploadError("You don’t have permission to upload here.", 403);
    organiserId = data.organiser_id;
  }
  // PR 03 reads these memberships from the DB through RLS, never JWT metadata.
  // Staff do not get an upload override: they must also be organiser members.
  if (!account.organisers.some((org) => org.id === organiserId)) {
    throw new UploadError("You don’t have permission to upload here.", 403);
  }
}

export async function requireStaffRead(client: SupabaseClient<Database>, account: Account) {
  requireActiveAccount(account);
  // Reuse PR 02's role helper; it includes both staff and admin profiles.
  const { data, error } = await client.rpc("is_staff");
  if (error) throw new Error("Staff access could not be checked.");
  if (!data) throw new UploadError("Only Tikatero staff can open verification documents.", 403);
}
