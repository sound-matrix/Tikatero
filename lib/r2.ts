import "server-only";

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  buildUploadKey,
  validateUpload,
  validatePrivateKey,
  validateReadTtl,
  UPLOAD_TTL_SECONDS,
  type UploadInput,
  type SignedUpload,
} from "@/lib/uploads/policy";
import { parsePublicBaseUrl } from "@/lib/uploads/public-base";

function required(value: string | undefined) {
  if (!value) throw new Error("Media storage is not configured.");
  return value;
}

function createR2Client() {
  const accountId = required(process.env.R2_ACCOUNT_ID);
  if (!/^[0-9a-f]{32}$/i.test(accountId)) throw new Error("Media storage is not configured.");
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required(process.env.R2_ACCESS_KEY_ID),
      secretAccessKey: required(process.env.R2_SECRET_ACCESS_KEY),
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

function bucket(privateObject: boolean) {
  if (
    process.env.R2_PUBLIC_BUCKET &&
    process.env.R2_PUBLIC_BUCKET === process.env.R2_PRIVATE_BUCKET
  ) {
    throw new Error("Public and private media must use separate buckets.");
  }
  return required(privateObject ? process.env.R2_PRIVATE_BUCKET : process.env.R2_PUBLIC_BUCKET);
}

export async function signUpload(value: UploadInput): Promise<SignedUpload> {
  const input = validateUpload(value);
  const key = buildUploadKey(input);
  const privateObject = input.kind === "kyc_doc";
  const publicUrl = privateObject
    ? undefined
    : new URL(key, parsePublicBaseUrl(required(process.env.R2_PUBLIC_BASE_URL))).href;
  const client = createR2Client();
  try {
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket(privateObject),
        Key: key,
        ContentType: input.mime,
        ContentLength: input.size,
      }),
      {
        expiresIn: UPLOAD_TTL_SECONDS,
        // Content-Length is sent automatically by browsers for a File body. Binding
        // it prevents using a small declared size to PUT an oversized object.
        signableHeaders: new Set(["content-type", "content-length"]),
      },
    );
    return {
      url,
      key,
      ...(publicUrl ? { publicUrl } : {}),
      expiresIn: UPLOAD_TTL_SECONDS,
      mime: input.mime,
    };
  } finally {
    client.destroy();
  }
}

// This function is server-only. Its HTTP caller must also require a staff account.
export async function getSignedReadUrl(key: string, ttlSeconds = UPLOAD_TTL_SECONDS) {
  validatePrivateKey(key);
  validateReadTtl(ttlSeconds);
  const client = createR2Client();
  try {
    return await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket(true),
        Key: key,
        ResponseCacheControl: "private, no-store",
        ResponseContentDisposition: `attachment; filename="verification-document.${key.split(".").pop()}"`,
      }),
      { expiresIn: ttlSeconds },
    );
  } finally {
    client.destroy();
  }
}
