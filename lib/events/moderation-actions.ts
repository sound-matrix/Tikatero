"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount } from "@/lib/auth/account";
import { createServiceClient } from "@/lib/supabase/service";
import { cancellationReason, processEventRefunds } from "@/lib/refunds/event-refunds";
import { cleanDeletedEventMedia, loadModerationEvent } from "./moderation-store";
import { canModerate, readModerationForm } from "./moderation-model";
import { notifyHost, notifyRemovalRequested } from "./moderation-notify";

function feedback(path: string, key: "notice" | "review_error", message: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(message)}`);
}

export async function moderateEvent(form: FormData) {
  const { account, client } = await requireAccount();
  const asStaff = form.get("as_staff") === "yes";
  const root = asStaff ? "/admin/events" : "/console/events";
  const id = String(form.get("event_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect(root);
  const path = `${root}/${id}`;
  let input;
  try {
    input = readModerationForm(form);
  } catch (error) {
    const message = error instanceof Error && !(error instanceof SyntaxError) ? error.message : "";
    feedback(
      path,
      "review_error",
      message.length < 160 ? message : "Check the details and try again.",
    );
  }
  const { command, confirmOwn } = input;
  if (!canModerate(account.profile.role, asStaff, command.operation))
    feedback(path, "review_error", "You do not have permission to do this.");

  const service = createServiceClient();
  const event = await loadModerationEvent(asStaff ? service : client, id);
  if (!event || (!asStaff && !account.organisers.some((org) => org.id === event.organiser_id)))
    feedback(path, "review_error", "You do not have permission to change this event.");

  if ("requestId" in command) {
    const { data, error } = await client
      .from("event_removal_requests")
      .select("event_id")
      .eq("id", command.requestId)
      .maybeSingle();
    if (error || data?.event_id !== id)
      feedback(path, "review_error", "That request does not belong to this event.");
  }

  const context = { p_event_id: id, p_confirm: confirmOwn };
  let notice: string;
  let runRefunds = false;
  let email: (() => Promise<unknown>) | undefined;
  const check = (error: { code: string; message: string } | null) => {
    if (!error) return;
    const expected = ["P0001", "P0002", "22023", "42501", "23505"].includes(error.code);
    const safe =
      expected &&
      error.message.length < 240 &&
      !/constraint|secret|password|schema|relation/i.test(error.message);
    feedback(
      path,
      "review_error",
      safe ? error.message : "The event could not be updated. Please try again.",
    );
  };

  switch (command.operation) {
    case "hide": {
      const reason = command.reason === "Other" ? command.note : command.reason;
      check(
        (await client.rpc("hide_event", { ...context, p_reason: reason, p_as_staff: asStaff }))
          .error,
      );
      if (asStaff) {
        const current = await loadModerationEvent(service, id);
        email = () =>
          notifyHost(event, "event_hidden_by_admin", reason, current?.hidden_at ?? "hidden");
      }
      notice = "This event is now hidden.";
      break;
    }
    case "unhide":
      check(
        (
          await client.rpc("unhide_event", {
            ...context,
            p_reason: command.reason,
            p_as_staff: asStaff,
          })
        ).error,
      );
      notice = "The event is no longer hidden.";
      break;
    case "request": {
      const result = await client.rpc("request_event_removal", {
        p_event_id: id,
        p_reason: command.reason,
      });
      check(result.error);
      email = () => notifyRemovalRequested(event, result.data!);
      notice = "Your removal request was sent.";
      break;
    }
    case "withdraw":
      check(
        (await client.rpc("withdraw_event_removal", { p_request_id: command.requestId })).error,
      );
      notice = "Your request was withdrawn. You can show the event again when you’re ready.";
      break;
    case "approve":
    case "reject": {
      const approved = command.operation === "approve";
      const result = await client.rpc("admin_decide_event_removal", {
        p_request_id: command.requestId,
        p_decision: approved ? "approved" : "rejected",
        p_note: command.reason,
        p_confirm: confirmOwn,
      });
      check(result.error);
      const decision = result.data as { reason: string; note: string | null };
      email = () =>
        notifyHost(
          event,
          approved ? "event_removal_approved" : "event_removal_rejected",
          approved ? decision.reason : (decision.note ?? command.reason),
          command.requestId,
        );
      runRefunds = approved;
      notice = approved
        ? "Removal approved and the event is cancelled."
        : "Request declined. The event stays hidden.";
      break;
    }
    case "cancel":
      check(
        (
          await client.rpc("admin_emergency_cancel_event", {
            ...context,
            p_title: command.title,
            p_reason: command.reason,
          })
        ).error,
      );
      email = () =>
        notifyHost(event, "event_removal_approved", command.reason, "emergency-cancelled");
      runRefunds = true;
      notice = "The event is cancelled.";
      break;
    case "retry":
      if (event.status !== "cancelled")
        feedback(path, "review_error", "Only cancelled events have queued event refunds.");
      check(
        (
          await client.rpc("cancel_event_refunds", {
            ...context,
            p_reason: await cancellationReason(id),
            p_as: "staff",
          })
        ).error,
      );
      runRefunds = true;
      notice = "Refunds checked.";
      break;
    case "delete":
      check(
        (await client.rpc("admin_delete_event", { ...context, p_reason: command.reason })).error,
      );
      updateTag("public-events");
      revalidatePath("/admin", "layout");
      revalidatePath("/console/events", "layout");
      try {
        await cleanDeletedEventMedia(id);
      } catch {
        feedback(root, "notice", "The event was deleted. Its images are queued for removal.");
      }
      feedback(root, "notice", "The event was permanently deleted.");
  }

  updateTag("public-events");
  revalidatePath("/admin", "layout");
  revalidatePath("/console/events", "layout");
  if (email) await email().catch(() => null);
  if (runRefunds) {
    const queued = await cancellationReason(id)
      .then((reason) => processEventRefunds(event, reason))
      .catch(() => true);
    if (queued) notice += " Refunds still in progress are shown below.";
  }
  feedback(path, "notice", notice);
}
