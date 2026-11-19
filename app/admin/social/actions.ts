"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSocialAdmin } from "@/lib/admin/access";
import { allowRequest } from "@/lib/security/rate-limit";
import { checkMetaLogin } from "@/lib/social/meta";

const idSchema = z.uuid();

function back(query: string): never {
  redirect(`/admin/social?${query}`);
}

export async function saveSocialSettings(form: FormData) {
  const { client } = await requireSocialAdmin();
  const reason = String(form.get("reason") ?? "")
    .trim()
    .slice(0, 1000);
  const cap = String(form.get("cap") ?? "");
  const start = String(form.get("window_start") ?? "");
  const end = String(form.get("window_end") ?? "");
  if (
    !reason ||
    !/^\d{1,2}$/.test(cap) ||
    Number(cap) < 1 ||
    Number(cap) > 50 ||
    !/^\d{2}:\d{2}$/.test(start) ||
    !/^\d{2}:\d{2}$/.test(end)
  ) {
    back("settings=error#social-switch");
  }
  const { error } = await client.rpc("admin_update_social_settings", {
    p_paused: form.get("paused") !== "no",
    p_window_start: start,
    p_window_end: end,
    p_ig_daily_cap: Number(cap),
    p_reason: reason,
  });
  if (error) back("settings=error#social-switch");
  revalidatePath("/admin/social");
  back("settings=saved#social-switch");
}

export async function checkMetaConnection() {
  const { account } = await requireSocialAdmin();
  if (!(await allowRequest("social-meta-check", account.profile.id, 10, 3600))) {
    back("meta=rate#social-setup");
  }
  const result = await checkMetaLogin();
  if (!result.ok) back(`meta=${"skipped" in result ? "missing" : "error"}#social-setup`);
  const params = new URLSearchParams({
    meta: "ok",
    page_name: result.pageName,
    ig: result.igUsername,
    expires: result.tokenExpires,
  });
  if (result.dataAccessExpires) params.set("data_expires", result.dataAccessExpires);
  params.set("hash", "1");
  revalidatePath("/admin/social");
  redirect(`/admin/social?${params.toString()}#social-setup`);
}

export async function retrySocialPost(form: FormData) {
  const { client } = await requireSocialAdmin();
  const id = form.get("id");
  if (typeof id !== "string" || !idSchema.safeParse(id).success) back("action=error");
  const { error } = await client.rpc("admin_social_retry", { p_id: id });
  revalidatePath("/admin/social");
  back(error ? "action=error" : "status=queued&action=saved");
}

export async function skipSocialPost(form: FormData) {
  const { client } = await requireSocialAdmin();
  const id = form.get("id");
  const reason = String(form.get("reason") ?? "")
    .trim()
    .slice(0, 300);
  if (typeof id !== "string" || !idSchema.safeParse(id).success || !reason) back("action=error");
  const { error } = await client.rpc("admin_social_skip", { p_id: id, p_reason: reason });
  revalidatePath("/admin/social");
  back(error ? "action=error" : "status=skipped&action=saved");
}

export async function updateSocialCaption(form: FormData) {
  const { client } = await requireSocialAdmin();
  const id = form.get("id");
  const caption = String(form.get("caption") ?? "");
  if (typeof id !== "string" || !idSchema.safeParse(id).success || !caption.trim())
    back("action=error");
  const { error } = await client.rpc("admin_social_update_caption", {
    p_id: id,
    p_caption: caption,
  });
  revalidatePath("/admin/social");
  back(error ? "action=error" : "status=queued&action=saved");
}

export async function queueSocialEvent(form: FormData) {
  const { client } = await requireSocialAdmin();
  const id = form.get("event_id");
  if (typeof id !== "string" || !idSchema.safeParse(id).success) back("action=error");
  const { error } = await client.rpc("admin_social_queue_event", { p_event_id: id });
  revalidatePath("/admin/social");
  back(error ? "action=error" : "status=queued&action=saved");
}

export async function saveEventSocial(form: FormData) {
  const { client } = await requireSocialAdmin();
  const id = form.get("event_id");
  const reason = String(form.get("reason") ?? "")
    .trim()
    .slice(0, 1000);
  const test = String(form.get("is_test") ?? "auto");
  const path =
    typeof id === "string" && idSchema.safeParse(id).success
      ? `/admin/events/${id}`
      : "/admin/events";
  if (path === "/admin/events" || !reason || !["auto", "yes", "no"].includes(test)) {
    redirect(`${path}?social=error#tikatero-social`);
  }
  const { error } = await client.rpc("admin_set_event_social", {
    p_event_id: id as string,
    p_autopost: form.get("autopost") === "yes",
    p_is_test: test === "yes" ? true : test === "no" ? false : null,
    p_ig_collaborator: String(form.get("ig_collaborator") ?? ""),
    p_reason: reason,
  });
  revalidatePath(path);
  revalidatePath("/admin/social");
  redirect(`${path}?social=${error ? "error" : "saved"}#tikatero-social`);
}
