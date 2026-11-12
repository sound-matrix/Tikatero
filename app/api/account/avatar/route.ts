import { randomUUID } from "node:crypto";
import { after } from "next/server";
import sharp from "sharp";
import { readAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";
import { allowRequest } from "@/lib/security/rate-limit";
import { sameRequestOrigin } from "@/lib/security/request-origin";
import { sweepAvatarCleanup } from "@/lib/account/avatar-store";

const maxBytes = 2 * 1024 * 1024;

export async function POST(request: Request) {
  if (!sameRequestOrigin(request)) return new Response(null, { status: 403 });
  const client = await createClient();
  const account = await readAccount(client);
  if (!account || account.profile.blocked_at) return new Response(null, { status: 401 });
  const id = account.profile.id;
  if (!(await allowRequest("avatar-upload", id, 12, 600)))
    return new Response(null, { status: 429 });
  const length = Number(request.headers.get("content-length"));
  if (!length || length > maxBytes) return new Response(null, { status: 413 });
  let photo: Buffer;
  try {
    const input = Buffer.from(await request.arrayBuffer());
    if (!input.length || input.length > maxBytes) return new Response(null, { status: 413 });
    const image = sharp(input, { limitInputPixels: 25_000_000 });
    if (!["jpeg", "png", "webp"].includes((await image.metadata()).format ?? ""))
      return new Response(null, { status: 415 });
    photo = await image
      .autoOrient()
      .resize(512, 512, { fit: "cover" })
      .webp({ quality: 86 })
      .toBuffer();
  } catch {
    return new Response(null, { status: 400 });
  }
  const path = `${id}/${randomUUID()}.webp`;
  const bucket = client.storage.from("avatars");
  const uploaded = await bucket.upload(path, photo, {
    contentType: "image/webp",
    cacheControl: "300",
  });
  if (uploaded.error) return new Response(null, { status: 503 });
  const updated = await client
    .from("profiles")
    .update({ avatar_path: path })
    .eq("id", id)
    .select("id")
    .single();
  if (updated.error) {
    await bucket.remove([path]);
    return new Response(null, { status: 503 });
  }
  after(() => sweepAvatarCleanup(id).catch(() => {}));
  return Response.json({ avatar: bucket.getPublicUrl(path).data.publicUrl });
}
