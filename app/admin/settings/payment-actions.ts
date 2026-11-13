"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/admin/access";

export async function savePaymentSettings(form: FormData) {
  const { client } = await requireStaff();
  const days = String(form.get("days") ?? "");
  const mode = String(form.get("mode") ?? "");
  const gateway = String(form.get("gateway") ?? "");
  const reason = String(form.get("reason") ?? "")
    .trim()
    .slice(0, 1000);
  if (!/^\d{1,3}$/.test(days) || Number(days) > 365 || !reason)
    redirect("/admin/settings?payment_error=1#payment-settings");
  const { error } = await client.rpc("admin_update_payment_settings", {
    p_mode: mode,
    p_gateway: gateway,
    p_days: Number(days),
    p_reason: reason,
  });
  if (error) redirect("/admin/settings?payment_error=1#payment-settings");
  revalidatePath("/pricing");
  revalidatePath("/legal/terms");
  revalidatePath("/console/payouts");
  redirect("/admin/settings?payment=1#payment-settings");
}
