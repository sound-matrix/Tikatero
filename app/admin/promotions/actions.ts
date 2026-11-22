"use server";
import { revalidatePath } from "next/cache";
import { requireSocialAdmin } from "@/lib/admin/access";

export async function decidePromotion(form: FormData) {
  const event = String(form.get("event") ?? "");
  const approved = form.get("decision") === "approve";
  if (!/^[0-9a-f-]{36}$/i.test(event)) throw new Error("Invalid event.");
  const { client } = await requireSocialAdmin();
  const { error } = await client.rpc("admin_decide_promotion", {
    p_event: event,
    p_approved: approved,
  });
  if (error) throw new Error("Campaign review failed. Verify the event is still public and upcoming.");
  revalidatePath("/admin/promotions");
}
