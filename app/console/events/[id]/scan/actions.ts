"use server";

import { requireAccount } from "@/lib/auth/account";
import { canScanEvent } from "@/lib/scan/access";
import { DEVICE_ID, EVENT_ID } from "@/lib/scan/codes";
import { issueOfflinePack, type OfflinePack } from "@/lib/scan/pack";
import { redeemScan, scanCounts, type ScanOutcome } from "@/lib/scan/redeem";

async function scanner(eventId: string) {
  if (!EVENT_ID.test(eventId)) return null;
  const { client, account } = await requireAccount();
  const { data } = await client
    .from("events")
    .select("id, organiser_id")
    .eq("id", eventId)
    .maybeSingle();
  if (!data || !canScanEvent(account, { id: data.id, organiserId: data.organiser_id })) return null;
  return account;
}

export async function redeemQueued(input: {
  eventId: string;
  deviceId: string;
  scans: { id: string; raw: string; scannedAt: string }[];
}): Promise<{ error?: string; results?: ({ id: string } & ScanOutcome)[] }> {
  const account = await scanner(input.eventId);
  if (!account || !DEVICE_ID.test(input.deviceId) || !Array.isArray(input.scans))
    return { error: "You can't scan this event." };
  const scans = input.scans
    .filter((scan) => scan && typeof scan.id === "string" && typeof scan.raw === "string")
    .slice(0, 40);
  const ordered = [...scans].sort((left, right) => left.scannedAt.localeCompare(right.scannedAt));
  const results = new Map<string, ScanOutcome>();
  for (const scan of ordered) {
    results.set(
      scan.id,
      await redeemScan({
        eventId: input.eventId,
        staffUserId: account.profile.id,
        deviceId: input.deviceId,
        scannedAt: typeof scan.scannedAt === "string" ? scan.scannedAt : "",
        raw: scan.raw,
      }),
    );
  }
  return { results: scans.map((scan) => ({ id: scan.id, ...results.get(scan.id) })) };
}

export async function loadOfflinePack(
  eventId: string,
  deviceId: string,
): Promise<{ pack?: OfflinePack; error?: string }> {
  const account = await scanner(eventId);
  if (!account) return { error: "You can't scan this event." };
  return issueOfflinePack({ eventId, staffUserId: account.profile.id, deviceId });
}

export async function loadScanCount(
  eventId: string,
): Promise<{ checkedIn?: number; total?: number; error?: string }> {
  const account = await scanner(eventId);
  if (!account) return { error: "You can't scan this event." };
  try {
    return await scanCounts(eventId, account.profile.id);
  } catch {
    return { error: "The check-in count could not be loaded." };
  }
}
