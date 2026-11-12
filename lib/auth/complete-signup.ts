import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { createServiceClient } from "@/lib/supabase/service";
import { send } from "@/lib/email/send";
import { createDraftOrganiser } from "./organiser";
import { landingPath, type Account } from "./routing";
import { signupIntent, type SignupIntent } from "./signup-intent";

export type Welcome = { profileId: string; email: string; intent: SignupIntent };

export async function completeSignup(client: SupabaseClient<Database>, account: Account) {
  const existingPath = landingPath(account);
  const service = createServiceClient();
  const { data: profile, error } = await service
    .from("profiles")
    .select("signup_intent, welcome_email_sent_at")
    .eq("id", account.profile.id)
    .single();
  if (error || !profile || profile.welcome_email_sent_at) return { path: existingPath };

  const intent = signupIntent.catch("attendee").parse(profile.signup_intent);
  let path = existingPath;
  if (intent === "organiser" && !account.organisers.length && !account.profile.blocked_at) {
    const { error: insertError } = await createDraftOrganiser(client, account.profile.id, "");
    if (insertError) {
      // A second tab can race the first insert. Re-read membership before giving up.
      const { data: membership } = await client
        .from("organiser_members")
        .select("id")
        .eq("organiser_id", account.profile.id)
        .eq("user_id", account.profile.id)
        .maybeSingle();
      if (!membership) {
        console.error("Organiser signup could not create a draft account.");
        return { path: existingPath };
      }
    }
    path = "/console/pending";
  }
  const { data: auth } = await client.auth.getUser();
  const email = auth.user?.email;
  return { path, welcome: email ? { profileId: account.profile.id, email, intent } : undefined };
}

export async function sendWelcomeOnce({ profileId, email, intent }: Welcome) {
  const service = createServiceClient();
  const claimedAt = new Date().toISOString();
  const { data: claimed, error } = await service
    .from("profiles")
    .update({ welcome_email_sent_at: claimedAt })
    .eq("id", profileId)
    .is("welcome_email_sent_at", null)
    .select("id");
  if (error) throw new Error("Could not claim welcome email.");
  if (!claimed?.length) return;
  const result = await send({
    template: intent === "organiser" ? "welcome_organiser" : "welcome_attendee",
    to: email,
    entityRef: `welcome:${profileId}`,
    data: {},
  });
  if (result.status === "skipped_not_configured") {
    // The email claim can move from skipped to sending when email is configured.
    await service
      .from("profiles")
      .update({ welcome_email_sent_at: null })
      .eq("id", profileId)
      .eq("welcome_email_sent_at", claimedAt);
  } else if (!["sent", "duplicate"].includes(result.status))
    console.error("Welcome email delivery did not complete:", result.status);
}
