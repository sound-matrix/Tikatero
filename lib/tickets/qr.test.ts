import { afterEach, expect, it, vi } from "vitest";
import { PNG } from "pngjs";
import jsQR from "jsqr";

vi.mock("server-only", () => ({}));
import { signTicket, signTicketLink, ticketQrPng, verifyTicket, verifyTicketLink } from "./qr";

const secret = "synthetic-ticket-qr-secret-value-32";
const code = "TK-01Z01-01";
const eventId = "c1200003-0000-4000-8000-000000000001";
const otherEvent = "c1200003-0000-4000-8000-000000000002";

afterEach(() => {
  vi.unstubAllEnvs();
});

it("signs and verifies a payload, and rejects tampering or another event", () => {
  vi.stubEnv("TICKET_QR_SECRET", secret);
  const payload = signTicket(code, eventId);
  expect(payload.startsWith(`${code}.`)).toBe(true);
  expect(payload.split(".").at(-1)).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(verifyTicket(payload, eventId)).toBe(true);
  expect(verifyTicket(`${payload.slice(0, -1)}a`, eventId)).toBe(false);
  expect(verifyTicket(payload, otherEvent)).toBe(false);
  expect(verifyTicket(`TK-01Z01-02.${payload.split(".").at(-1)}`, eventId)).toBe(false);
  expect(verifyTicket(code, eventId)).toBe(false);
  expect(verifyTicket(`${code}.`, eventId)).toBe(false);
});

it("keeps a link on one ticket until it expires", () => {
  vi.stubEnv("TICKET_QR_SECRET", secret);
  const now = Date.parse("2026-11-04T00:00:00.000Z");
  const link = signTicketLink(code, now);
  expect(link.path.startsWith(`/t/${code}?t=`)).toBe(true);
  expect(verifyTicketLink(code, link.token, now)).toBe(true);
  expect(verifyTicketLink("TK-01Z01-02", link.token, now)).toBe(false);
  expect(verifyTicketLink(code, `${link.token.slice(0, -1)}a`, now)).toBe(false);
  expect(verifyTicketLink(code, link.token, now + 8 * 24 * 60 * 60 * 1000)).toBe(false);
});

it("fails closed when signing is not configured", () => {
  vi.stubEnv("TICKET_QR_SECRET", "");
  expect(verifyTicket(`${code}.abc`, eventId)).toBe(false);
  expect(() => signTicket(code, eventId)).toThrow(/not configured/);
});

it("draws a QR that a camera decoder reads back as the payload", async () => {
  vi.stubEnv("TICKET_QR_SECRET", secret);
  const payload = signTicket(code, eventId);
  const png = await ticketQrPng(payload);
  const image = PNG.sync.read(png);
  const decoded = jsQR(new Uint8ClampedArray(image.data), image.width, image.height);
  expect(decoded?.data).toBe(payload);
});
