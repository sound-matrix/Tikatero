import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { verifyTicket } from "@/lib/tickets/qr";
import { DEVICE_ID, EVENT_ID, parseScanInput } from "./codes";
import { plainDatabaseError } from "./errors";

export type ScanOutcome = {
  result?: string;
  holderName?: string | null;
  tier?: string | null;
  error?: string;
};

const SCAN_FALLBACK = "That ticket could not be checked. Try again.";

function signingReady() {
  const value = process.env.TICKET_QR_SECRET;
  return Boolean(value && value.length >= 32);
}

async function describeTicket(code: string, eventId: string) {
  const client = createServiceClient();
  const { data } = await client
    .from("tickets")
    .select("holder_name, event_id, ticket_type_id")
    .eq("code", code)
    .maybeSingle();
  if (!data || data.event_id !== eventId) return { holderName: null, tier: null };
  const { data: tier } = await client
    .from("ticket_types")
    .select("name")
    .eq("id", data.ticket_type_id)
    .maybeSingle();
  return { holderName: data.holder_name, tier: tier?.name ?? "Ticket" };
}

export async function redeemScan(input: {
  eventId: string;
  staffUserId: string;
  deviceId: string;
  scannedAt: string;
  raw: string;
}): Promise<ScanOutcome> {
  if (!EVENT_ID.test(input.eventId) || !DEVICE_ID.test(input.deviceId))
    return { error: "This phone is not allowed to scan this event." };
  const scannedAt = new Date(input.scannedAt);
  if (Number.isNaN(scannedAt.getTime())) return { result: "Invalid" };
  const parsed = parseScanInput(input.raw);
  if (!parsed) return { result: "Invalid" };

  if (parsed.kind === "qr") {
    if (!signingReady())
      return { error: "Check-in isn't ready yet. Ask the organiser to try again." };
    if (!verifyTicket(parsed.payload, input.eventId)) {
      const { data } = await createServiceClient()
        .from("tickets")
        .select("event_id")
        .eq("code", parsed.code)
        .maybeSingle();
      if (!data || data.event_id === input.eventId) return { result: "Invalid" };
    }
  }

  const { data, error } = await createServiceClient().rpc("scan_redeem", {
    ticket_code: parsed.code,
    event_id: input.eventId,
    device_id: input.deviceId,
    scanned_at: scannedAt.toISOString(),
    staff_user_id: input.staffUserId,
  });
  if (error || !data) return { error: plainDatabaseError(error, SCAN_FALLBACK) };
  const named =
    data === "Valid" || data === "Test ticket" || data.startsWith("Already checked in")
      ? await describeTicket(parsed.code, input.eventId)
      : { holderName: null, tier: null };
  return { result: data, ...named };
}

export async function scanCounts(eventId: string, staffUserId: string) {
  const { data, error } = await createServiceClient().rpc("scan_progress", {
    p_event_id: eventId,
    p_user_id: staffUserId,
  });
  if (error || !data?.[0]) throw new Error("The check-in count could not be loaded.");
  return { checkedIn: data[0].checked_in, total: data[0].total };
}
