"use server";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyUnsubscribe } from "@/lib/marketing/unsubscribe";

export async function stopPromotionEmails(form: FormData) {
  const token = String(form.get("token") ?? "");
  if (token.length > 120) throw new Error("Invalid unsubscribe link.");
  const userId = verifyUnsubscribe(token);
  if (!userId) throw new Error("This unsubscribe link is invalid.");
  const { error } = await createServiceClient().rpc("promotion_stop_email", { p_user: userId });
  if (error) throw new Error("The unsubscribe request could not be saved.");
  redirect("/unsubscribe?done=1");
}
