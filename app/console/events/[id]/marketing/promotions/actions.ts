"use server";
import { revalidatePath } from "next/cache";
import { requireAccount } from "@/lib/auth/account";

export type CampaignState = { success?: string; error?: string };
export async function requestSmartPromotion(_previous: CampaignState, form: FormData): Promise<CampaignState> {
  const id = String(form.get("event") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Choose an event." };
  const { client, account } = await requireAccount();
  if (!account.organisers.length) return { error: "Organiser access is required." };
  const { error } = await client.rpc("host_request_promotion", { p_event: id });
  if (error) return { error: "This event is not eligible for promotion." };
  revalidatePath(`/console/events/${id}/marketing`);
  return { success: "Promotion requested. Tikatero will review it before any message is sent." };
}
