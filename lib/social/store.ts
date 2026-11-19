import "server-only";
import { createHash } from "node:crypto";
import { PUBLIC_BUCKET } from "@/lib/storage";
import { createServiceClient } from "@/lib/supabase/service";
import { storagePublicBase } from "@/lib/uploads/public-base";
import type { SocialImageFormat } from "@/lib/social/render";

const imagePath = /^social\/[0-9a-f-]{36}\/(square|story|last_seats)-[0-9a-f]{16}\.jpg$/;

export function socialImageUrl(path: string | null) {
  const base = storagePublicBase(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!base || !path || !imagePath.test(path)) return null;
  const url = `${base}${path.split("/").map(encodeURIComponent).join("/")}`;
  return url.startsWith("https:") ? url : null;
}

export async function storeSocialImage(eventId: string, format: SocialImageFormat, bytes: Buffer) {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const path = `social/${eventId}/${format}-${hash}.jpg`;
  const bucket = createServiceClient().storage.from(PUBLIC_BUCKET);
  const uploaded = await bucket.upload(path, bytes, {
    contentType: "image/jpeg",
    upsert: false,
    cacheControl: "31536000",
  });
  if (uploaded.error && !/already exists|duplicate/i.test(uploaded.error.message))
    throw uploaded.error;
  return { path, url: socialImageUrl(path) };
}

export async function readStoredSocialImage(eventId: string, format: "square" | "story") {
  const bucket = createServiceClient().storage.from(PUBLIC_BUCKET);
  const folder = `social/${eventId}`;
  const listed = await bucket.list(folder, { limit: 100 });
  if (listed.error || !listed.data) return null;
  const file = listed.data.find(
    (entry) => entry.name.startsWith(`${format}-`) && entry.name.endsWith(".jpg"),
  );
  if (!file) return null;
  const downloaded = await bucket.download(`${folder}/${file.name}`);
  if (downloaded.error || !downloaded.data) return null;
  return Buffer.from(await downloaded.data.arrayBuffer());
}
