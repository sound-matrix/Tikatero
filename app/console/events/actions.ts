"use server";
import { revalidatePath, updateTag } from "next/cache";
import { requireAccount } from "@/lib/auth/account";
import {
  inputSchema,
  validateStep,
  validatePublish,
  validateSavedInput,
  stepPayload,
} from "@/lib/events/validation";
import { toPaise } from "@/lib/events/model";
import { hasInternationalKyc } from "@/lib/kyc/store";
import { INTERNATIONAL_PAID_TICKETS, internationalPaidTicketError } from "@/lib/kyc/paid-tickets";
import { readDraft, type Draft } from "@/lib/events/store";
import type { Json } from "@/lib/db/types";
export type SaveResult = { error?: string; draft?: Draft };
export async function saveEvent(input: unknown): Promise<SaveResult> {
  const { client, account } = await requireAccount();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Please check the event details." };
  const data = parsed.data;
  if (!account.organisers.some((o) => o.id === data.organiserId))
    return { error: "You do not have permission to edit this event." };
  let payload: Json;
  try {
    const international =
      (data.publish || data.step === 0 || data.step === 5) &&
      (await hasInternationalKyc(client, data.organiserId));
    if (international && !data.publish) {
      const error = internationalPaidTicketError(
        true,
        data.values.free,
        data.step === 5 ? data.values.tiers.map((tier) => toPaise(tier.price || "0")) : [],
      );
      if (error) return { error };
    }
    validateSavedInput(data.values, data.step, data.eventId);
    let complete = true;
    try {
      validateStep(data.values, data.step, data.eventId);
    } catch (error) {
      complete = false;
      if (data.advance || data.publish) throw error;
    }
    if (data.revision === 0 && data.values.title.length < 3)
      return { error: "Enter an event name with at least 3 characters." };
    payload = { ...stepPayload(data.values, data.step), _complete: complete } as Json;
    if (data.publish) {
      const saved = await readDraft(client, data.eventId);
      if (!saved || saved.organiserId !== data.organiserId)
        return { error: "Save your event before publishing." };
      if (international) {
        const error = internationalPaidTicketError(
          true,
          saved.values.free,
          saved.values.tiers.map((tier) => toPaise(tier.price || "0")),
        );
        if (error) return { error };
      }
      validatePublish(saved.values, data.eventId);
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Please check the event details." };
  }
  const { error } = await client.rpc("save_event_wizard", {
    p_event_id: data.eventId,
    p_organiser_id: data.organiserId,
    p_revision: data.revision,
    p_step: data.step,
    p_next_step: data.nextStep,
    p_data: payload,
    p_publish: data.publish,
  });
  if (error?.message === INTERNATIONAL_PAID_TICKETS) return { error: INTERNATIONAL_PAID_TICKETS };
  if (error?.message.startsWith("You've already sold ")) return { error: error.message };
  if (error?.message === "Shorten the extra event details and try again.")
    return { error: error.message };
  if (error?.message === "Use the event review actions.")
    return { error: "Unhide this event before publishing again." };
  if (error?.message === "A tier with sold tickets cannot be removed")
    return { error: "People have already booked this ticket type, so it can't be removed." };
  if (error?.message === "A tier with sold tickets cannot change price")
    return { error: "People have already booked this ticket type, so its price can't change." };
  if (
    error?.message ===
    "People have already booked under these rules, so you can only make them more generous."
  )
    return { error: error.message };
  if (error?.message === "Show this event before publishing it.") return { error: error.message };
  if (error)
    return {
      error:
        error.code === "40001"
          ? "This event changed in another tab. Reload before saving."
          : error.code === "42501"
            ? "You no longer have permission to edit this event."
            : error.message.includes("publish blocked")
              ? "Your draft is safe. Publishing needs approved verification and ticket sales must not be paused."
              : error.code === "23505"
                ? "Something didn't save. Please reload the page and try again."
                : error.code === "23503"
                  ? "People have already booked this ticket type, so it can't be removed."
                  : "Your event could not be saved. Check your details and try again.",
    };
  const draft = await readDraft(client, data.eventId);
  if (draft?.status === "published") updateTag("public-events");
  revalidatePath("/console/events", "layout");
  return { draft: draft ?? undefined };
}
