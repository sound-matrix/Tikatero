import { formatIst } from "@/lib/format";
import { earliestWins } from "./conflict";
import { parseScanInput } from "./codes";
import { keyFromBase64, verifyEventSignature } from "./signature";

export const OFFLINE_LIST_MISS = "This ticket isn't in the offline list. Connect to check it.";

export type OfflineTicketStatus = "valid" | "used" | "void" | "transferred" | "refunded";

export type OfflineTicket = {
  code: string;
  holderName: string;
  tier: string;
  test: boolean;
  checkedInAt: string | null;
  status: OfflineTicketStatus | string;
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

/** Void, refunded, transferred, and any other non-valid status are not an admission. */
function refusedTicket(ticket: OfflineTicket): string | null {
  if (ticket.status !== "valid" && ticket.status !== "used") return "Invalid";
  if (ticket.test) return "Test ticket";
  if (ticket.status === "used") {
    return ticket.checkedInAt
      ? `Already checked in at ${formatIst(ticket.checkedInAt)}`
      : "Already checked in";
  }
  return null;
}

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

  if (parsed.kind === "qr") {
    const key = keyFromBase64(input.pack.key);
    if (!key || !(await verifyEventSignature(parsed.payload, key)))
      return { result: "Invalid", queued: input.queued };
    if (!ticket) return { result: OFFLINE_LIST_MISS, queued: input.queued };
  } else if (!ticket) {
    return { result: "Invalid", queued: input.queued };
  }

  const refused = refusedTicket(ticket);
  if (refused)
    return {
      result: refused,
      holderName: ticket.holderName,
      tier: ticket.tier,
      queued: input.queued,
    };

  const entry: QueuedScan = {
    id: input.id ?? crypto.randomUUID(),
    raw: parsed.kind === "qr" ? parsed.payload : parsed.code,
    code: parsed.code,
    scannedAt: input.scannedAt,
    result: "Valid",
    holderName: ticket.holderName,
    tier: ticket.tier,
  };
  const known: QueuedScan[] =
    ticket.checkedInAt && !ticket.test && ticket.status === "valid"
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
    result: shown?.result ?? entry.result,
    holderName: entry.holderName,
    tier: entry.tier,
    queued: stored,
  };
}
