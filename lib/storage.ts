import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { storagePublicBase } from "@/lib/uploads/public-base";
import {
  buildUploadKey,
  isPrivateUpload,
  validateUpload,
  validatePrivateKey,
  validateReadTtl,
  validateFile,
  UPLOAD_TTL_SECONDS,
  UPLOAD_CHUNK_BYTES,
  MAX_DOCUMENT_BYTES,
  UploadError,
  type UploadInput,
  type SignedUpload,
} from "@/lib/uploads/policy";

export const PUBLIC_BUCKET = "event-media";
export const PRIVATE_BUCKET = "private-files";

export function privateStorageConfigured() {
  return Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
    storagePublicBase(process.env.NEXT_PUBLIC_SUPABASE_URL),
  );
}
function requireStorage() {
  if (!privateStorageConfigured()) throw new Error("Media storage is not configured.");
}
function signature(payload: string) {
  requireStorage();
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .update(`tikatero-upload-v1:${payload}`)
    .digest();
}
type UploadTicket = { input: UploadInput; key: string; expires: number };

export async function signUpload(value: UploadInput): Promise<SignedUpload> {
  requireStorage();
  const input = validateUpload(value);
  const key = buildUploadKey(input);
  const payload = Buffer.from(
    JSON.stringify({ input, key, expires: Math.floor(Date.now() / 1000) + UPLOAD_TTL_SECONDS }),
  ).toString("base64url");
  return {
    url: "/api/uploads/file",
    key,
    mime: input.mime,
    expiresIn: UPLOAD_TTL_SECONDS,
    headers: { "x-upload-token": `${payload}.${signature(payload).toString("base64url")}` },
    ...(isPrivateUpload(input.kind)
      ? {}
      : { publicUrl: `${storagePublicBase(process.env.NEXT_PUBLIC_SUPABASE_URL)}${key}` }),
  };
}
export function readUploadTicket(token: string | null): UploadTicket {
  const invalid = () =>
    new UploadError("This upload link has expired or could not be used. Please try again.", 403);
  if (!token || token.length > 2048) throw invalid();
  const [payload, mac, extra] = token.split(".");
  if (!payload || !mac || extra) throw invalid();
  const actual = Buffer.from(mac, "base64url");
  const expected = signature(payload);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw invalid();
  try {
    const ticket = JSON.parse(Buffer.from(payload, "base64url").toString()) as UploadTicket;
    const input = validateUpload(ticket.input);
    const filename = ticket.key.split("/").pop()!;
    if (
      buildUploadKey(input, filename.split(".")[0]) !== ticket.key ||
      !Number.isSafeInteger(ticket.expires) ||
      ticket.expires <= Date.now() / 1000 ||
      ticket.expires > Math.floor(Date.now() / 1000) + UPLOAD_TTL_SECONDS
    )
      throw invalid();
    return { ...ticket, input };
  } catch {
    throw invalid();
  }
}

/** Magic bytes are checked server-side before any public object is written. */
export function validateBytes(input: UploadInput, body: Uint8Array, complete = true) {
  validateFile(input.kind, input.mime, input.size);
  if (complete && body.byteLength !== input.size)
    throw new UploadError("The file size changed. Please choose it again.");
  const bytes = Buffer.from(body);
  const detected = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "image/png"
    : bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      ? "image/jpeg"
      : bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP"
        ? "image/webp"
        : bytes.subarray(0, 5).toString() === "%PDF-"
          ? "application/pdf"
          : null;
  if (detected !== input.mime)
    throw new UploadError("The file contents do not match its type. Please choose another file.");
}
function partsPrefix(ticket: UploadTicket) {
  return `upload-parts/${ticket.expires}-${ticket.key.split("/").pop()!.split(".")[0]}`;
}
export async function discardUpload(ticket: UploadTicket) {
  const paths = Array.from(
    { length: Math.ceil(ticket.input.size / UPLOAD_CHUNK_BYTES) },
    (_, i) => `${partsPrefix(ticket)}/${i}`,
  );
  await createServiceClient().storage.from(PRIVATE_BUCKET).remove(paths);
}
/** Private staging keeps every HTTP body below Vercel's request limit. */
export async function putUploadChunk(ticket: UploadTicket, part: number, body: Uint8Array) {
  const { input, key } = ticket;
  const count = Math.ceil(input.size / UPLOAD_CHUNK_BYTES);
  const expected = Math.min(UPLOAD_CHUNK_BYTES, input.size - part * UPLOAD_CHUNK_BYTES);
  if (!Number.isInteger(part) || part < 0 || part >= count || body.byteLength !== expected)
    throw new UploadError("The file size changed. Please choose it again.");
  if (part === 0) validateBytes(input, body, count === 1);
  const storage = createServiceClient().storage;
  const privateBucket = storage.from(PRIVATE_BUCKET);
  if (count > 1) {
    const saved = await privateBucket.upload(`${partsPrefix(ticket)}/${part}`, body, {
      contentType: "application/octet-stream",
      upsert: false,
    });
    if (saved.error) throw new Error("File part could not be uploaded.");
    if (part < count - 1) return;
  }
  try {
    let file = body;
    if (count > 1) {
      const chunks: Uint8Array[] = [];
      for (let i = 0; i < count; i++) {
        const result = await privateBucket.download(`${partsPrefix(ticket)}/${i}`);
        const size = Math.min(UPLOAD_CHUNK_BYTES, input.size - i * UPLOAD_CHUNK_BYTES);
        if (result.error || !result.data || result.data.size !== size)
          throw new UploadError("Some file parts are missing. Please upload the file again.");
        chunks.push(new Uint8Array(await result.data.arrayBuffer()));
      }
      file = Buffer.concat(chunks);
    }
    validateBytes(input, file);
    const result = await storage
      .from(isPrivateUpload(input.kind) ? PRIVATE_BUCKET : PUBLIC_BUCKET)
      .upload(key, file, {
        contentType: input.mime,
        upsert: false,
        cacheControl: isPrivateUpload(input.kind) ? "0" : "3600",
      });
    if (result.error) throw new Error("File could not be uploaded.");
  } finally {
    if (count > 1) await discardUpload(ticket).catch(() => {});
  }
}

/** Bounded cleanup of expired/abandoned private parts, called when starting uploads. */
export async function cleanupExpiredUploads() {
  const bucket = createServiceClient().storage.from(PRIVATE_BUCKET);
  const folders = await bucket.list("upload-parts", {
    limit: 20,
    sortBy: { column: "name", order: "asc" },
  });
  for (const folder of folders.data ?? []) {
    if (
      !/^\d{10}-[0-9a-f-]{36}$/.test(folder.name) ||
      Number(folder.name.slice(0, 10)) >= Date.now() / 1000
    )
      continue;
    const prefix = `upload-parts/${folder.name}`;
    const parts = await bucket.list(prefix, { limit: 4 });
    if (parts.data?.length) await bucket.remove(parts.data.map((part) => `${prefix}/${part.name}`));
  }
}
const TICKET_PDF_KEY =
  /^tickets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/TK-[A-Z0-9]{5}-[0-9]{2}\.pdf$/;
function ticketPdfKey(key: string) {
  if (!TICKET_PDF_KEY.test(key)) throw new Error("Ticket file is not available.");
  return key;
}
export async function putPrivatePdf(key: string, body: Buffer) {
  ticketPdfKey(key);
  if (
    !body.length ||
    body.length > MAX_DOCUMENT_BYTES ||
    body.subarray(0, 5).toString() !== "%PDF-"
  )
    throw new UploadError("Ticket PDF is invalid or too large.");
  requireStorage();
  const { error } = await createServiceClient()
    .storage.from(PRIVATE_BUCKET)
    .upload(key, body, { contentType: "application/pdf", cacheControl: "0", upsert: true });
  if (error) throw new Error("Ticket file could not be saved.");
}
async function signedRead(key: string, ttl: number, filename: string | false) {
  validateReadTtl(ttl);
  const { data, error } = await createServiceClient()
    .storage.from(PRIVATE_BUCKET)
    .createSignedUrl(key, ttl, { download: filename });
  if (error || !data?.signedUrl) throw new Error("File is not available.");
  return data.signedUrl;
}
export async function signTicketPdf(key: string, filename: string) {
  ticketPdfKey(key);
  if (!/^TK-[A-Z0-9]{5}-[0-9]{2}\.pdf$/.test(filename))
    throw new Error("Ticket file is not available.");
  return signedRead(key, UPLOAD_TTL_SECONDS, filename);
}
// HTTP callers retain staff-only authorisation before issuing KYC links.
export async function getSignedReadUrl(key: string, ttlSeconds = UPLOAD_TTL_SECONDS) {
  validatePrivateKey(key);
  return signedRead(
    key,
    ttlSeconds,
    key.startsWith("kyc/") ? false : `verification-document.${key.split(".").pop()}`,
  );
}
