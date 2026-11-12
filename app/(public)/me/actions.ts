"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";
import { signOutPath } from "@/lib/auth/return-path";
import { landingPath } from "@/lib/auth/routing";
import { profileValues } from "@/lib/auth/validation";
import { createDraftOrganiser } from "@/lib/auth/organiser";

export type FormState = { error?: string; success?: string };

export async function updateProfile(_previous: FormState, data: FormData): Promise<FormState> {
  const { client, account } = await requireAccount();
  const values = profileValues(data);
  if (values.error) return { error: values.error };
  // Column allow-list plus PR 2's column grants prevent role/block escalation.
  const { data: updated, error } = await client
    .from("profiles")
    .update({ full_name: values.fullName, phone: values.phone })
    .eq("id", account.profile.id)
    .select("id")
    .single();
  if (error || !updated) return { error: "Your changes could not be saved. Please try again." };
  revalidatePath("/me");
  return { success: "Your details have been saved." };
}

export async function becomeOrganiser(_previous: FormState, data: FormData): Promise<FormState> {
  const { client, account } = await requireAccount();
  if (account.organisers.length || ["staff", "admin"].includes(account.profile.role))
    redirect(landingPath(account));
  const displayName = String(data.get("display_name") ?? "").trim();
  if (!displayName || displayName.length > 100)
    return { error: "Enter an organiser name (up to 100 characters)." };
  const { error } = await createDraftOrganiser(client, account.profile.id, displayName);
  if (error) return { error: "Your organiser account could not be created. Please try again." };
  revalidatePath("/me");
  redirect("/console/pending");
}

export async function signOut(data: FormData) {
  const client = await createClient();
  const { error } = await client.auth.signOut();
  if (error) throw new Error("Sign-out failed. Please try again.");
  revalidatePath("/", "layout");
  redirect(signOutPath(data.get("next")));
}
