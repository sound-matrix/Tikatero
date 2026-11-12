import { z } from "zod";

export const hideReasons = [
  "Date or venue changing",
  "Not ready yet",
  "Low ticket sales",
  "Safety concern",
  "Other",
] as const;

const reason = z.string().trim().min(1, "Enter a reason.").max(300, "Use up to 300 characters.");
const optionalReason = z.string().trim().max(300, "Use up to 300 characters.");
const eventId = z.uuid();
const moderationForm = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("hide"),
    reason: z.enum(hideReasons),
    note: optionalReason,
  }),
  z.object({ operation: z.literal("unhide"), reason: optionalReason }),
  z.object({ operation: z.literal("request"), reason, acknowledged: z.literal("yes") }),
  z.object({ operation: z.literal("withdraw"), requestId: eventId }),
  z.object({ operation: z.literal("approve"), requestId: eventId, reason: optionalReason }),
  z.object({ operation: z.literal("reject"), requestId: eventId, reason }),
  z.object({ operation: z.literal("cancel"), reason, title: z.string().min(1) }),
  z.object({ operation: z.literal("delete"), reason }),
  z.object({ operation: z.literal("retry") }),
]);

export function readModerationForm(form: FormData) {
  const get = (name: string) => String(form.get(name) ?? "");
  const parsed = moderationForm.safeParse({
    operation: get("operation"),
    reason: get("reason"),
    note: get("note"),
    requestId: get("request_id"),
    title: get("title"),
    acknowledged: get("acknowledged"),
  });
  const id = eventId.safeParse(get("event_id"));
  if (!id.success) throw new Error("Choose an event.");
  if (!parsed.success) {
    if (get("operation") === "request" && get("acknowledged") !== "yes")
      throw new Error("Confirm that buyers will get a full refund.");
    throw new Error(parsed.error.issues[0]?.message ?? "Check the event review details.");
  }
  const asStaff = get("as_staff") === "yes";
  const command = parsed.data;
  if (command.operation === "hide" && command.reason === "Other") reason.parse(command.note);
  if (command.operation === "unhide" && asStaff) reason.parse(command.reason);
  return { id: id.data, asStaff, confirmOwn: get("confirm_own") === "yes", command };
}

export function canModerate(role: string, asStaff: boolean, operation: string) {
  if (operation === "delete" || operation === "cancel") return asStaff && role === "admin";
  if (operation === "request" || operation === "withdraw") return !asStaff;
  if (asStaff) return role === "admin" || role === "staff";
  return operation === "hide" || operation === "unhide";
}

export const eventStatuses = ["draft", "pending", "published", "unpublished", "ended", "cancelled"];
