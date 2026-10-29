import { createClient } from "@/lib/supabase/server";
import { readAccount } from "@/lib/auth/account";
import { requireActiveAccount, requireUploadMembership } from "@/lib/uploads/access";
import { validateUpload } from "@/lib/uploads/policy";
import { readUploadBody, uploadResponse, uploadFailure } from "@/lib/uploads/http";
import { signUpload } from "@/lib/r2";

export async function POST(request: Request) {
  try {
    const client = await createClient();
    const account = await readAccount(client);
    requireActiveAccount(account);
    const input = validateUpload(await readUploadBody(request));
    await requireUploadMembership(client, account, input);
    return uploadResponse(await signUpload(input));
  } catch (error) {
    return uploadFailure(error);
  }
}
