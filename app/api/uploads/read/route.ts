import { createClient } from "@/lib/supabase/server";
import { readAccount } from "@/lib/auth/account";
import { requireActiveAccount, requireStaffRead } from "@/lib/uploads/access";
import {
  UploadError,
  validatePrivateKey,
  validateReadTtl,
  UPLOAD_TTL_SECONDS,
  UUID_PATTERN,
} from "@/lib/uploads/policy";
import { readUploadBody, uploadResponse, uploadFailure } from "@/lib/uploads/http";
import { getSignedReadUrl } from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const client = await createClient();
    const account = await readAccount(client);
    requireActiveAccount(account);
    const body = await readUploadBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new UploadError("Please choose a verification document.");
    const input = body as Record<string, unknown>;
    if (
      typeof input.applicationId === "string" &&
      UUID_PATTERN.test(input.applicationId) &&
      typeof input.slot === "string" &&
      ["front", "back", "selfie"].includes(input.slot)
    ) {
      if (account.profile.role !== "admin")
        throw new UploadError("Only Tikatero admins can open these identity documents.", 403);
      const { data: key, error } = await client.rpc("open_intl_kyc_document", {
        p_id: input.applicationId,
        p_slot: input.slot,
      });
      if (error || !key) throw new UploadError("This document is unavailable.", 404);
      return uploadResponse({ url: await getSignedReadUrl(key), expiresIn: UPLOAD_TTL_SECONDS });
    }
    await requireStaffRead(client, account);
    validatePrivateKey(input.key);
    if (input.key.startsWith("kyc/"))
      throw new UploadError("Choose the document from its verification application.", 403);
    const ttl = input.ttlSeconds ?? UPLOAD_TTL_SECONDS;
    validateReadTtl(ttl);
    return uploadResponse({ url: await getSignedReadUrl(input.key, ttl), expiresIn: ttl });
  } catch (error) {
    return uploadFailure(error);
  }
}
