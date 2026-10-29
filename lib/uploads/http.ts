import "server-only";

import { UploadError } from "./policy";

export function uploadResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
  });
}

export function uploadFailure(error: unknown) {
  return error instanceof UploadError
    ? uploadResponse({ error: error.message }, error.status)
    : uploadResponse({ error: "Uploads are temporarily unavailable. Please try again." }, 503);
}

export async function readUploadBody(request: Request): Promise<unknown> {
  // Signing accepts metadata only, never file bytes. Bound chunked requests too.
  const reader = request.body?.getReader();
  if (!reader) throw new UploadError("Please choose a file to upload.");
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4096) {
        await reader.cancel();
        throw new UploadError("This request is too big. Please choose your file again.", 413);
      }
      chunks.push(value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(body));
  } catch (error) {
    if (error instanceof UploadError) throw error;
    throw new UploadError("Please choose a file and try again.");
  } finally {
    reader.releaseLock();
  }
}
