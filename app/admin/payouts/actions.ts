"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/app/admin/actions";
import { requireStaff } from "@/lib/admin/access";
import { uuid } from "@/lib/admin/model";
import { decryptBankNumber } from "@/lib/payouts/bank";
import { notifyPayoutSettled } from "@/lib/payouts/notify";
import { parseHundredths } from "@/lib/pricing/settings";
import { PRIVATE_BUCKET } from "@/lib/storage";
import { createServiceClient } from "@/lib/supabase/service";

type PayoutState = ActionState & { bankNumber?: string };
const mimeExtensions: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

function value(form: FormData, key: string) {
  const input = form.get(key);
  return typeof input === "string" ? input.trim() : "";
}

function saved(success: string) {
  for (const path of [
    "/admin",
    "/admin/payouts",
    "/admin/reconciliation",
    "/console",
    "/console/payouts",
  ])
    revalidatePath(path);
  return { success };
}

async function uploadProof(file: FormDataEntryValue | null, host: string) {
  if (!(file instanceof File) || file.size === 0) return null;
  const extension = mimeExtensions[file.type];
  if (!extension || file.size > 750_000) throw new Error("Choose a PDF, PNG or JPEG up to 750 KB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const valid =
    extension === "pdf"
      ? bytes.subarray(0, 5).toString() === "%PDF-"
      : extension === "png"
        ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  if (!valid) throw new Error("The proof file does not match its file type.");
  const path = `payout-proofs/${host}/${randomUUID()}.${extension}`;
  const result = await createServiceClient().storage.from(PRIVATE_BUCKET).upload(path, bytes, {
    contentType: file.type,
    cacheControl: "0",
    upsert: false,
  });
  if (result.error) throw new Error("The payout proof could not be saved.");
  return path;
}

function amount(form: FormData) {
  const input = value(form, "amount");
  const absolute = parseHundredths(input.replace(/^-/, ""));
  return input.startsWith("-") ? -absolute : absolute;
}

export async function payoutAction(_state: PayoutState, form: FormData): Promise<PayoutState> {
  const { client } = await requireStaff();
  const op = value(form, "operation");
  const host = value(form, "host");
  const event = value(form, "event") || null;
  const test = value(form, "test") === "true";
  const reason = value(form, "reason").slice(0, 1000);
  const reference = value(form, "reference");
  if (op === "void") {
    const id = value(form, "payout");
    if (!uuid(id)) return { error: "Choose a payment." };
    const { error } = await client.rpc("admin_void_manual_payout", {
      p_id: id,
      p_reference: reference,
      p_reason: reason,
    });
    return error ? { error: error.message } : saved("Payment record voided.");
  }
  if (!uuid(host) || (event && !uuid(event))) return { error: "Choose a host and event." };
  if (op === "show") {
    const { data, error } = await client.rpc("admin_payout_bank_details", {
      p_organiser: host,
      p_event: null,
      p_test: test,
      p_export: false,
    });
    if (error) return { error: "The bank account could not be loaded." };
    if (data === null) return { error: "Too many requests. Try again in an hour." };
    const row = (data as { id: string; encrypted_number: string }[])[0];
    if (!row) return { error: "The host needs to confirm their bank account." };
    try {
      return { bankNumber: decryptBankNumber(row.encrypted_number, row.id) };
    } catch {
      return { error: "The bank account could not be loaded." };
    }
  }
  if (op === "mode") {
    const mode = value(form, "mode");
    const { error } = await client.rpc("admin_set_host_payout_mode", {
      p_id: host,
      p_mode: mode || null,
      p_reason: reason,
    });
    return error
      ? { error: "The host payment mode could not be saved. Enter a reason." }
      : saved("Payment mode saved.");
  }
  let paise: number;
  try {
    paise = amount(form);
    if (paise === 0 || (op !== "adjust" && paise < 0)) throw new Error();
  } catch {
    return { error: "Enter a valid amount in rupees and paise." };
  }
  if (op === "adjust") {
    const { error } = await client.rpc("admin_add_earnings_adjustment", {
      p_organiser: host,
      p_event: event,
      p_amount: paise,
      p_reason: reason,
      p_test: test,
    });
    return error ? { error: error.message } : saved("Adjustment recorded.");
  }
  if (op !== "pay") return { error: "Choose a payment action." };
  const paidOn = value(form, "paidOn");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return { error: "Enter the bank transfer date." };
  if (form.has("override") && !reason) return { error: "Enter a reason for the override." };
  let proof: string | null;
  try {
    proof = await uploadProof(form.get("proof"), host);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "The payout proof could not be saved.",
    };
  }
  const { data: id, error } = await client.rpc("admin_record_manual_payout", {
    p_organiser: host,
    p_event: event,
    p_amount: paise,
    p_method: value(form, "method"),
    p_reference: reference,
    p_paid_on: paidOn,
    p_note: value(form, "note") || null,
    p_proof: proof,
    p_test: test,
    p_override_reason: form.has("override") ? reason : null,
  });
  if (proof) {
    // Check what was committed before cleanup, including after a lost RPC response.
    const service = createServiceClient();
    const existing = await service
      .from("payouts")
      .select("proof_path")
      .eq("organiser_id", host)
      .eq("bank_reference", reference.toUpperCase())
      .maybeSingle();
    if (!existing.error && existing.data?.proof_path !== proof)
      await service.storage.from(PRIVATE_BUCKET).remove([proof]);
  }
  if (error || !id)
    return {
      error:
        error?.code === "P0001" || error?.code === "23505"
          ? error.message
          : "The payment could not be recorded.",
    };
  const mail = await notifyPayoutSettled(id).catch(() => null);
  return saved(
    mail && ["sent", "sent_unlogged", "duplicate"].includes(mail.status)
      ? "Payment recorded. Email sent."
      : test
        ? "Test payment recorded."
        : "Payment recorded. Email delivery needs attention.",
  );
}
