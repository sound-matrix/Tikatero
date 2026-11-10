export const EVENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DEVICE_ID = /^[A-Za-z0-9_-]{16,64}$/;
export const TICKET_CODE = /^TK-[A-Z0-9]{5}-[0-9]{2}$/;
export const INVITE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export type ParsedScan =
  { kind: "code"; code: string } | { kind: "qr"; code: string; payload: string };

/** A typed ticket code, or a `code.signature` QR payload. */
export function parseScanInput(raw: string): ParsedScan | null {
  const value = raw.trim();
  if (!value || value.length > 200 || /[\u0000-\u001f]/.test(value)) return null;
  const dot = value.lastIndexOf(".");
  if (dot === -1) {
    const code = value.toUpperCase();
    return TICKET_CODE.test(code) ? { kind: "code", code } : null;
  }
  const code = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  if (!TICKET_CODE.test(code) || !signature || signature.length > 120) return null;
  return { kind: "qr", code, payload: `${code}.${signature}` };
}
