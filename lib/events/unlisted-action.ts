"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/admin/access";

const reasonSchema = z.string().trim().min(1).max(300);

export async function setEventUnlisted(form: FormData) {
  const { account, client } = await requireStaff();
  const id = form.get("event_id");
  if (!z.uuid().safeParse(id).success || typeof id !== "string") redirect("/admin/events");
  const path = `/admin/events/${id}`;
  const feedback = (status: "saved" | "error" | "stale") =>
    `${path}?visibility=${status}#event-visibility`;
  const reason = reasonSchema.safeParse(form.get("reason"));
  const revision = form.get("revision");
  if (
    account.profile.role !== "admin" ||
    !reason.success ||
    typeof revision !== "string" ||
    !/^\d{1,10}$/.test(revision) ||
    Number(revision) > 2147483647
  )
    redirect(feedback("error"));

  const { error } = await client.rpc("admin_set_event_unlisted", {
    p_event_id: id,
    p_is_unlisted: form.get("is_unlisted") === "yes",
    p_reason: reason.data,
    p_revision: Number(revision),
  });
  if (error) redirect(feedback(error.code === "40001" ? "stale" : "error"));

  updateTag("public-events");
  revalidatePath(path);
  redirect(feedback("saved"));
}
