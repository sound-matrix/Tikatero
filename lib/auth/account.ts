import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/db/types";
import type { Account } from "./routing";

export async function readAccount(client: SupabaseClient<Database>): Promise<Account | null> {
  // getUser verifies the session with Auth, including revocation. Never trust getSession alone.
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) return null;
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id, full_name, phone, role, blocked_at, block_reason")
    .eq("id", user.id)
    .single();
  if (profileError || !profile)
    throw new Error("Your account could not be loaded. Please try again.");
  if (profile.blocked_at) return { profile, organisers: [] };
  // A profile role is insufficient: only actual memberships grant console access.
  const { data: memberships, error: memberError } = await client
    .from("organiser_members")
    .select("organiser_id")
    .eq("user_id", user.id);
  if (memberError) throw new Error("Your account could not be loaded. Please try again.");
  const ids = memberships.map((member) => member.organiser_id);
  if (!ids.length) return { profile, organisers: [] };
  const { data: organisers, error: orgError } = await client
    .from("organisers")
    .select("id, kyc_status")
    .in("id", ids);
  if (orgError || organisers.length !== ids.length)
    throw new Error("Your account could not be loaded. Please try again.");
  return { profile, organisers };
}

export async function requireAccount() {
  const client = await createClient();
  const account = await readAccount(client);
  if (!account) redirect("/login");
  if (account.profile.blocked_at) redirect("/blocked");
  return { client, account };
}
