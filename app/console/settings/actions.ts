"use server";

import { revalidatePath } from "next/cache";
import { requireAccount } from "@/lib/auth/account";
import { createServiceClient } from "@/lib/supabase/service";

export type OrganisationSettingsState = { success?: string; error?: string };

export async function saveOrganisationSettings(
  _previous: OrganisationSettingsState,
  data: FormData,
): Promise<OrganisationSettingsState> {
  const organiserId = String(data.get("organiserId") ?? "");
  const displayName = String(data.get("displayName") ?? "").trim().replace(/\s+/g, " ");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organiserId))
    return { error: "Select a valid organisation." };
  if (displayName.length < 2 || displayName.length > 100 || /[\u0000-\u001f\u007f]/.test(displayName))
    return { error: "Use an organisation name between 2 and 100 characters." };

  const { account } = await requireAccount();
  if (!account.organisers.some((org) => org.id === organiserId))
    return { error: "You don't have access to this organisation." };

  const service = createServiceClient();
  const { data: org, error: fetchError } = await service
    .from("organisers")
    .select("id, owner_id")
    .eq("id", organiserId)
    .maybeSingle();
  if (fetchError || !org || org.owner_id !== account.profile.id)
    return { error: "Only the organisation owner can update its display name." };

  const { data: updated, error } = await service
    .from("organisers")
    .update({ display_name: displayName })
    .eq("id", organiserId)
    .eq("owner_id", account.profile.id)
    .select("id")
    .maybeSingle();
  if (error || !updated) return { error: "Could not update the organisation. Please try again." };
  revalidatePath("/console/settings");
  revalidatePath("/console");
  return { success: "Organisation name saved." };
}
