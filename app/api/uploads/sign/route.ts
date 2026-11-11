import { createClient } from "@/lib/supabase/server";
import { readAccount } from "@/lib/auth/account";
import { requireActiveAccount, requireUploadMembership } from "@/lib/uploads/access";
import { validateUpload } from "@/lib/uploads/policy";
import { readUploadBody, uploadResponse, uploadFailure } from "@/lib/uploads/http";
import { after } from "next/server";
import { signUpload, cleanupExpiredUploads } from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const client = await createClient();
    const account = await readAccount(client);
    requireActiveAccount(account);
    const input = validateUpload(await readUploadBody(request));
    await requireUploadMembership(client, account, input);
    const signed = await signUpload(input);
    after(() => cleanupExpiredUploads().catch(() => {}));
    return uploadResponse(signed);
  } catch (error) {
    return uploadFailure(error);
  }
}
