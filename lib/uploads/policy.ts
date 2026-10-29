export const uploadKinds = ["poster", "guest_photo", "org_logo", "kyc_doc"] as const;
export type UploadKind = (typeof uploadKinds)[number];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const UPLOAD_TTL_SECONDS = 300;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const extensions = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
} as const;
export type UploadMime = keyof typeof extensions;
export type UploadInput = { kind: UploadKind; mime: UploadMime; size: number; entityId: string };
export type SignedUpload = {
  url: string;
  key: string;
  publicUrl?: string;
  expiresIn: number;
  mime: UploadMime;
};

export class UploadError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function validateFile(
  kind: UploadKind,
  mime: unknown,
  size: unknown,
): asserts mime is UploadMime {
  const document = kind === "kyc_doc";
  if (
    typeof mime !== "string" ||
    !Object.hasOwn(extensions, mime) ||
    (!document && mime === "application/pdf")
  ) {
    throw new UploadError(
      document
        ? "Please choose a JPG, PNG, WebP photo or a PDF document."
        : "Please choose a JPG, PNG or WebP photo.",
    );
  }
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size <= 0)
    throw new UploadError("This file is empty or unreadable. Please choose another file.");
  if (size > (document ? MAX_DOCUMENT_BYTES : MAX_IMAGE_BYTES)) {
    throw new UploadError(
      document
        ? "This document is too big — please use one under 10 MB."
        : "This photo is too big — please use one under 5 MB.",
      413,
    );
  }
}

export function validateUpload(value: unknown): UploadInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new UploadError("Please choose a file to upload.");
  const input = value as Record<string, unknown>;
  if (!uploadKinds.includes(input.kind as UploadKind))
    throw new UploadError("Please choose a supported upload type.");
  if (typeof input.entityId !== "string" || !UUID_PATTERN.test(input.entityId))
    throw new UploadError("Please choose a valid event or organiser.");
  const kind = input.kind as UploadKind;
  validateFile(kind, input.mime, input.size);
  return {
    kind,
    mime: input.mime,
    size: input.size as number,
    entityId: input.entityId.toLowerCase(),
  };
}

export function buildUploadKey(input: UploadInput, id = crypto.randomUUID()): string {
  const valid = validateUpload(input);
  if (!UUID_PATTERN.test(id)) throw new UploadError("A file name could not be created.");
  return `${valid.kind}/${valid.entityId}/${id.toLowerCase()}.${extensions[valid.mime]}`;
}

export function validatePrivateKey(key: unknown): asserts key is string {
  if (typeof key !== "string")
    throw new UploadError("Please choose a valid verification document.");
  const parts = key.split("/");
  const filename = parts[2]?.match(/^([0-9a-f-]+)\.(jpg|png|webp|pdf)$/i);
  if (
    parts.length !== 3 ||
    parts[0] !== "kyc_doc" ||
    !UUID_PATTERN.test(parts[1]) ||
    !filename ||
    !UUID_PATTERN.test(filename[1])
  ) {
    throw new UploadError("Please choose a valid verification document.");
  }
}

export function validateReadTtl(ttl: unknown): asserts ttl is number {
  if (typeof ttl !== "number" || !Number.isInteger(ttl) || ttl < 1 || ttl > UPLOAD_TTL_SECONDS) {
    throw new UploadError("The download link must expire within 5 minutes.");
  }
}
