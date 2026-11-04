import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";

const LINK_TTL_SECONDS = 7 * 24 * 60 * 60;

function signingSecret() {
  const value = process.env.TICKET_QR_SECRET;
  if (!value || value.length < 32) return null;
  return value;
}

function requireSecret() {
  const value = signingSecret();
  if (!value) throw new Error("Ticket signing is not configured.");
  return value;
}

function same(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

/** Per-event HMAC key. The raw key is never stored. */
export function eventSigningKey(eventId: string) {
  return createHmac("sha256", requireSecret()).update(eventId).digest();
}

/** QR payload `code.sig`, signed with HMAC(TICKET_QR_SECRET, event id). */
export function signTicket(code: string, eventId: string) {
  const signature = createHmac("sha256", eventSigningKey(eventId)).update(code).digest("base64url");
  return `${code}.${signature}`;
}

export function verifyTicket(payload: string, eventId: string) {
  const secret = signingSecret();
  if (!secret) return false;
  const dot = payload.lastIndexOf(".");
  if (dot <= 0) return false;
  const code = payload.slice(0, dot);
  const signature = payload.slice(dot + 1);
  const expected = createHmac("sha256", createHmac("sha256", secret).update(eventId).digest())
    .update(code)
    .digest("base64url");
  return same(signature, expected);
}

export function signTicketLink(code: string, now = Date.now()) {
  const exp = Math.floor(now / 1000) + LINK_TTL_SECONDS;
  const signature = createHmac("sha256", requireSecret())
    .update(`link.${code}.${exp}`)
    .digest("base64url");
  const token = `${exp}.${signature}`;
  return { token, path: `/t/${code}?t=${token}` };
}

export function verifyTicketLink(code: string, token: string, now = Date.now()) {
  const secret = signingSecret();
  if (!secret) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expRaw = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!/^[0-9]{10,12}$/.test(expRaw)) return false;
  const exp = Number(expRaw);
  if (!Number.isSafeInteger(exp) || exp * 1000 < now) return false;
  const expected = createHmac("sha256", secret).update(`link.${code}.${exp}`).digest("base64url");
  return same(signature, expected);
}

export async function ticketQrSvg(payload: string) {
  const svg = await QRCode.toString(payload, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    color: { dark: "#2D3142", light: "#FFFFFF" },
  });
  if (!svg.startsWith("<svg") || /<script/i.test(svg))
    throw new Error("Ticket QR could not be drawn.");
  return svg;
}

export async function ticketQrPng(payload: string) {
  return QRCode.toBuffer(payload, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
    color: { dark: "#2D3142", light: "#FFFFFF" },
  });
}
