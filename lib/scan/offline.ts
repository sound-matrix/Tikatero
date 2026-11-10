import { earliestWins } from "./conflict";
import { parseScanInput } from "./codes";
import { keyFromBase64, verifyEventSignature } from "./signature";

export type OfflineTicket = {
  code: string;
  holderName: string;
  tier: string;
  test: boolean;
  checkedInAt: string | null;
};

export type OfflinePackView = {
  eventId: string;
  title: string;
  expiresAt: string;
  key: string;
  tickets: OfflineTicket[];
};

export type QueuedScan = {
  id: string;
  raw: string;
  code: string;
  scannedAt: string;
  result: string;
  holderName: string | null;
  tier: string | null;
};

export function packIsLive(expiresAt: string, now = Date.now()) {
  const time = Date.parse(expiresAt);
  return Number.isFinite(time) && time > now;
}

export async function judgeOfflineScan(input: {
  raw: string;
  scannedAt: string;
  pack: OfflinePackView | null;
  queued: QueuedScan[];
  now?: number;
  id?: string;
}): Promise<{
  error?: string;
  result?: string;
  holderName?: string | null;
  tier?: string | null;
  queued: QueuedScan[];
}> {
  const now = input.now ?? Date.now();
  if (!input.pack || !packIsLive(input.pack.expiresAt, now)) {
    return {
      error: "You're offline and this check-in pack has expired. Connect to continue.",
      queued: input.queued,
    };
  }
  const parsed = parseScanInput(input.raw);
  if (!parsed) return { result: "Invalid", queued: input.queued };
  const ticket = input.pack.tickets.find((item) => item.code === parsed.code);

  let admission: "Valid" | "Test ticket" | null = null;
  if (parsed.kind === "qr") {
    const key = keyFromBase64(input.pack.key);
    if (!key || !(await verifyEventSignature(parsed.payload, key)))
      return { result: "Invalid", queued: input.queued };
    admission = ticket?.test ? "Test ticket" : "Valid";
  } else if (!ticket) {
    return { result: "Invalid", queued: input.queued };
  } else {
    admission = ticket.test ? "Test ticket" : "Valid";
  }

  const entry: QueuedScan = {
    id: input.id ?? crypto.randomUUID(),
    raw: parsed.kind === "qr" ? parsed.payload : parsed.code,
    code: parsed.code,
    scannedAt: input.scannedAt,
    result: admission,
    holderName: ticket?.holderName ?? null,
    tier: ticket?.tier ?? null,
  };
  const known: QueuedScan[] =
    ticket?.checkedInAt && admission === "Valid"
      ? [
          {
            id: `known-${ticket.code}`,
            raw: "",
            code: ticket.code,
            scannedAt: ticket.checkedInAt,
            result: "Valid",
            holderName: ticket.holderName,
            tier: ticket.tier,
          },
        ]
      : [];
  const stored = [...input.queued, entry];
  const shown = earliestWins([...known, ...stored]).find((item) => item.id === entry.id);
  return {
    result: shown?.result ?? admission,
    holderName: entry.holderName,
    tier: entry.tier,
    queued: stored,
  };
}
