import { createHmac } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { eventSigningKey, signTicket, verifyTicket } from "@/lib/tickets/qr";
import { verifyEventSignature } from "./signature";

const secret = "synthetic-ticket-qr-secret-value-32";
const code = "TK-01Z01-01";
const eventId = "c1200003-0000-4000-8000-000000000001";

afterEach(() => {
  vi.unstubAllEnvs();
});

it("verifies a ticket with the derived event key and rejects the public key version", async () => {
  vi.stubEnv("TICKET_QR_SECRET", secret);
  const payload = signTicket(code, eventId);
  const key = eventSigningKey(eventId);
  expect(verifyTicket(payload, eventId)).toBe(true);
  expect(await verifyEventSignature(payload, key)).toBe(true);
  expect(Buffer.from(key).equals(Buffer.from(secret))).toBe(false);
  expect(Buffer.from(key).toString("utf8")).not.toContain(secret);
  const forged = createHmac("sha256", "v1").update(code).digest("base64url");
  expect(verifyTicket(`${code}.${forged}`, eventId)).toBe(false);
  expect(await verifyEventSignature(`${code}.${forged}`, key)).toBe(false);
  expect(await verifyEventSignature(`${payload.slice(0, -1)}a`, key)).toBe(false);
});
