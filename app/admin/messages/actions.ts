"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/admin/access";
import { uuid } from "@/lib/admin/model";

export type MarkState = { error?: string };

function text(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function markContactReplied(_state: MarkState, form: FormData): Promise<MarkState> {
  const { client } = await requireStaff();
  const id = text(form, "id");
  if (!uuid(id)) return { error: "Choose a message." };
  const { error } = await client.rpc("admin_mark_contact_replied", { p_id: id });
  if (error) {
    if (error.message.includes("already marked as replied")) {
      return { error: "This message is already marked as replied." };
    }
    return { error: "This message could not be updated. Please try again." };
  }
  revalidatePath("/admin/messages");
  return {};
}
