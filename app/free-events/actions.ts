"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAccount } from "@/lib/auth/account";
import { createServiceClient } from "@/lib/supabase/service";
import { requireStaff } from "@/lib/admin/access";

function uuid(value: FormDataEntryValue | null): string {
  const text = String(value ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text))
    throw new Error("Invalid event identifier.");
  return text;
}
function plainText(value: FormDataEntryValue | null, min: number, max: number): string {
  const text = String(value ?? "").trim();
  if (text.length < min || text.length > max) throw new Error("Enter a valid reason.");
  return text;
}

export async function requestFreeEventApproval(formData: FormData): Promise<void> {
  const { account } = await requireAccount();
  const eventId = uuid(formData.get("event_id"));
  const reason = plainText(formData.get("reason"), 10, 2000);
  const db = createServiceClient() as unknown as SupabaseClient;
  const { data: event, error } = await db.from("events")
    .select("id,organiser_id,is_free,status").eq("id", eventId).single();
  if (error || !event || !event.is_free || event.status === "published"
      || !account.organisers.some((org) => org.id === event.organiser_id))
    throw new Error("This free event is not available for approval.");
  const { data: used, error: usageError } = await db.from("free_event_publications")
    .select("event_id").eq("organiser_id", event.organiser_id).limit(1);
  if (usageError) throw new Error("Could not verify free event allowance.");
  if (!used?.length) throw new Error("Your first free event does not need additional approval.");
  const { data: existing, error: requestError } = await db
    .from("free_event_requests")
    .select("id,status").eq("event_id", eventId).maybeSingle();
  if (requestError) throw new Error("Could not load existing request.");
  if (existing) {
    if (existing.status === "pending" || existing.status === "approved")
      throw new Error("This event already has an active approval request.");
    const { error: updateError } = await db.from("free_event_requests")
      .update({ reason, status: "pending", admin_note: null, reviewed_by: null, reviewed_at: null, updated_at: new Date().toISOString() })
      .eq("event_id", eventId);
    if (updateError) throw new Error("Could not resubmit request.");
  } else {
    const { error: insertError } = await db.from("free_event_requests")
      .insert({ event_id: eventId, organiser_id: event.organiser_id, reason });
    if (insertError) throw new Error("Could not submit request.");
  }
  revalidatePath("/admin/free-events");
  revalidatePath(`/console/events/${eventId}/free-request`);
}

export async function decideFreeEventRequest(formData: FormData): Promise<void> {
  const { account } = await requireStaff();
  if (account.profile.role !== "admin") throw new Error("Admin permission required.");
  const requestId = uuid(formData.get("request_id"));
  const decision = String(formData.get("decision"));
  if (decision !== "approved" && decision !== "rejected")
    throw new Error("Invalid decision.");
  const note = plainText(formData.get("note"), 10, 1000);
  const db = createServiceClient() as unknown as SupabaseClient;
  const { data: request, error: loadError } = await db
    .from("free_event_requests").select("*").eq("id", requestId).single();
  if (loadError || !request || request.status !== "pending")
    throw new Error("This request is no longer pending.");
  const { error: updateError, data: updated } = await db
    .from("free_event_requests")
    .update({ status: decision, admin_note: note, reviewed_by: account.profile.id,
      reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", requestId).eq("status", "pending").select("id").maybeSingle();
  if (updateError || !updated) throw new Error("Request changed during review. Reload.");
  const { error: auditError } = await db.from("free_event_decisions").insert({
    request_id: requestId, event_id: request.event_id, decision,
    reason: note, admin_id: account.profile.id
  });
  if (auditError) throw new Error("Approval saved but audit log failed. Contact engineering.");
  revalidatePath("/admin/free-events");
}
