import { afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { eventSigningKey, signTicket } from "@/lib/tickets/qr";
import {
  judgeOfflineScan,
  OFFLINE_LIST_MISS,
  type OfflinePackView,
  type OfflineTicket,
  type QueuedScan,
} from "./offline";

const secret = "synthetic-ticket-qr-secret-value-32";
const eventId = "c1200003-0000-4000-8000-000000000001";
const code = "TK-01Z01-01";

function pack(now = Date.parse("2026-11-07T12:00:00.000Z")): OfflinePackView {
  vi.stubEnv("TICKET_QR_SECRET", secret);
  return {
    eventId,
    title: "Scan night",
    expiresAt: new Date(now + 60_000).toISOString(),
    key: Buffer.from(eventSigningKey(eventId)).toString("base64"),
    tickets: [
      {
        code,
        holderName: "Asha",
        tier: "General Admission",
        test: false,
        status: "valid",
        checkedInAt: null,
      },
      {
        code: "TK-01Z01-02",
        holderName: "Test Buyer",
        tier: "General Admission",
        test: true,
        status: "valid",
        checkedInAt: null,
      },
    ],
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

it("queues a signed ticket offline and lets the earliest scan win", async () => {
  const now = Date.parse("2026-11-07T12:00:00.000Z");
  const ready = pack(now);
  expect(JSON.stringify(ready)).not.toContain(secret);
  const payload = signTicket(code, eventId);
  const first = await judgeOfflineScan({
    raw: payload,
    scannedAt: "2026-11-07T13:00:00.000Z",
    pack: ready,
    queued: [],
    now,
    id: "late",
  });
  expect(first.result).toBe("Valid");
  expect(first.holderName).toBe("Asha");
  const second = await judgeOfflineScan({
    raw: payload,
    scannedAt: "2026-11-07T12:30:00.000Z",
    pack: ready,
    queued: first.queued,
    now,
    id: "early",
  });
  expect(second.result).toBe("Valid");
  const shown = await judgeOfflineScan({
    raw: code,
    scannedAt: "2026-11-07T13:30:00.000Z",
    pack: ready,
    queued: second.queued,
    now,
    id: "manual",
  });
  expect(shown.result).toBe("Already checked in at 7 Nov 2026, 6:00 PM IST");
  expect(shown.queued.map((item: QueuedScan) => item.result)).toContain("Valid");
});

it("rejects a forged signature, a test ticket, an unknown code, and an expired pack", async () => {
  const now = Date.parse("2026-11-07T12:00:00.000Z");
  const ready = pack(now);
  const forged = await judgeOfflineScan({
    raw: `${code}.not-a-real-signature`,
    scannedAt: "2026-11-07T12:30:00.000Z",
    pack: ready,
    queued: [],
    now,
  });
  expect(forged.result).toBe("Invalid");
  expect(forged.queued).toHaveLength(0);
  const testTicket = await judgeOfflineScan({
    raw: "TK-01Z01-02",
    scannedAt: "2026-11-07T12:30:00.000Z",
    pack: ready,
    queued: [],
    now,
  });
  expect(testTicket.result).toBe("Test ticket");
  const unknown = await judgeOfflineScan({
    raw: "TK-01Z01-09",
    scannedAt: "2026-11-07T12:30:00.000Z",
    pack: ready,
    queued: [],
    now,
  });
  expect(unknown.result).toBe("Invalid");
  const expired = await judgeOfflineScan({
    raw: code,
    scannedAt: "2026-11-07T12:30:00.000Z",
    pack: { ...ready, expiresAt: new Date(now - 1000).toISOString() },
    queued: [],
    now,
  });
  expect(expired.error).toMatch(/expired/);
});

function withTicket(ready: OfflinePackView, ticket: OfflineTicket): OfflinePackView {
  return { ...ready, tickets: [...ready.tickets, ticket] };
}

it("does not admit void, refunded, transferred, or missing tickets offline", async () => {
  const now = Date.parse("2026-11-07T12:00:00.000Z");
  const ready = pack(now);
  const voidCode = "TK-01Z01-04";
  const refundedCode = "TK-01Z01-05";
  const transferredCode = "TK-01Z01-06";
  const missingCode = "TK-01Z01-07";
  const loaded = withTicket(
    withTicket(
      withTicket(ready, {
        code: voidCode,
        holderName: "Void",
        tier: "General Admission",
        test: false,
        status: "void",
        checkedInAt: null,
      }),
      {
        code: refundedCode,
        holderName: "Refunded",
        tier: "General Admission",
        test: false,
        status: "refunded",
        checkedInAt: null,
      },
    ),
    {
      code: transferredCode,
      holderName: "Moved",
      tier: "General Admission",
      test: false,
      status: "transferred",
      checkedInAt: null,
    },
  );
  for (const ticketCode of [voidCode, refundedCode, transferredCode]) {
    const signed = await judgeOfflineScan({
      raw: signTicket(ticketCode, eventId),
      scannedAt: "2026-11-07T12:30:00.000Z",
      pack: loaded,
      queued: [],
      now,
    });
    expect(signed.result).toBe("Invalid");
    expect(signed.queued).toHaveLength(0);
    const typed = await judgeOfflineScan({
      raw: ticketCode,
      scannedAt: "2026-11-07T12:30:00.000Z",
      pack: loaded,
      queued: [],
      now,
    });
    expect(typed.result).toBe("Invalid");
    expect(typed.queued).toHaveLength(0);
  }
  const missing = await judgeOfflineScan({
    raw: signTicket(missingCode, eventId),
    scannedAt: "2026-11-07T12:30:00.000Z",
    pack: loaded,
    queued: [],
    now,
  });
  expect(missing.result).toBe(OFFLINE_LIST_MISS);
  expect(missing.result).not.toBe("Valid");
  expect(missing.queued).toHaveLength(0);
  expect(JSON.stringify(loaded)).not.toContain(secret);
});

it("reports a used ticket as already checked in, in IST", async () => {
  const now = Date.parse("2026-11-07T12:00:00.000Z");
  const ready = pack(now);
  const used = withTicket(ready, {
    code: "TK-01Z01-03",
    holderName: "Ben",
    tier: "General Admission",
    test: false,
    status: "used",
    checkedInAt: "2026-11-07T12:30:00.000Z",
  });
  const scan = await judgeOfflineScan({
    raw: signTicket("TK-01Z01-03", eventId),
    scannedAt: "2026-11-07T13:00:00.000Z",
    pack: used,
    queued: [],
    now,
  });
  expect(scan.result).toBe("Already checked in at 7 Nov 2026, 6:00 PM IST");
  expect(scan.queued).toHaveLength(0);
});
