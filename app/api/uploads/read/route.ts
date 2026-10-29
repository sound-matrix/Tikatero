import { createClient } from "@/lib/supabase/server";
import { readAccount } from "@/lib/auth/account";
import { requireActiveAccount, requireStaffRead } from "@/lib/uploads/access";
import {
  UploadError,
  validatePrivateKey,
  validateReadTtl,
  UPLOAD_TTL_SECONDS,
} from "@/lib/uploads/policy";
import { readUploadBody, uploadResponse, uploadFailure } from "@/lib/uploads/http";
import { getSignedReadUrl } from "@/lib/r2";

export async function POST(request: Request) {
  try {
    const client = await createClient();
    const account = await readAccount(client);
    requireActiveAccount(account);
    await requireStaffRead(client, account);
    const body = await readUploadBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new UploadError("Please choose a verification document.");
    const input = body as Record<string, unknown>;
    validatePrivateKey(input.key);
    const ttl = input.ttlSeconds ?? UPLOAD_TTL_SECONDS;
    validateReadTtl(ttl);
    return uploadResponse({ url: await getSignedReadUrl(input.key, ttl), expiresIn: ttl });
  } catch (error) {
    return uploadFailure(error);
  }
}
