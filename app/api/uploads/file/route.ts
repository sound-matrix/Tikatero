import { createClient } from "@/lib/supabase/server";
import { readAccount } from "@/lib/auth/account";
import { requireActiveAccount, requireUploadMembership } from "@/lib/uploads/access";
import { readUploadTicket, putUploadChunk, discardUpload } from "@/lib/storage";
import { UploadError, UPLOAD_CHUNK_BYTES } from "@/lib/uploads/policy";
import { uploadResponse, uploadFailure } from "@/lib/uploads/http";

async function authorised(request: Request) {
  const client = await createClient();
  const account = await readAccount(client);
  requireActiveAccount(account);
  const ticket = readUploadTicket(request.headers.get("x-upload-token"));
  await requireUploadMembership(client, account, ticket.input);
  return ticket;
}
export async function PUT(request: Request) {
  try {
    const ticket = await authorised(request);
    const rawPart = new URL(request.url).searchParams.get("part");
    if (!rawPart || !/^[0-3]$/.test(rawPart)) throw new UploadError("Choose a valid file part.");
    const part = Number(rawPart);
    const expected = Math.min(UPLOAD_CHUNK_BYTES, ticket.input.size - part * UPLOAD_CHUNK_BYTES);
    if (expected <= 0 || request.headers.get("content-type") !== ticket.input.mime)
      throw new UploadError("Choose a valid file part.");
    const reader = request.body?.getReader();
    if (!reader) throw new UploadError("Please choose a file to upload.");
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > expected) {
          await reader.cancel();
          throw new UploadError("This file is too big. Please choose it again.", 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    await putUploadChunk(ticket, part, Buffer.concat(chunks));
    return uploadResponse({ uploaded: true });
  } catch (error) {
    return uploadFailure(error);
  }
}
export async function DELETE(request: Request) {
  try {
    await discardUpload(await authorised(request));
    return uploadResponse({ cancelled: true });
  } catch (error) {
    return uploadFailure(error);
  }
}
