"use server";
import { revalidatePath } from "next/cache";
import { requireAccount } from "@/lib/auth/account";
import {
  inputSchema,
  validateStep,
  validatePublish,
  validateSavedInput,
  stepPayload,
} from "@/lib/events/validation";
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
                ? "A guest or tier could not be saved. Reload and try again."
                : error.code === "23503"
                  ? "A ticket tier already in use cannot be removed."
                  : "Your event could not be saved. Check your details and try again.",
    };
  revalidatePath("/console/events", "layout");
  return { draft: (await readDraft(client, data.eventId)) ?? undefined };
}
