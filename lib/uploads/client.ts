"use client";

import { UPLOAD_CHUNK_BYTES, type SignedUpload } from "./policy";

// Sequential 3 MB parts fit Vercel's body limit. Server checks membership on every part.
export async function putFile(
  file: File,
  signed: SignedUpload,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<void> {
  try {
    for (let offset = 0, part = 0; offset < file.size; offset += UPLOAD_CHUNK_BYTES, part++) {
      const body = file.slice(offset, offset + UPLOAD_CHUNK_BYTES);
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const abort = () => xhr.abort();
        const finish = (error?: Error) => {
          signal.removeEventListener("abort", abort);
          if (error) reject(error);
          else resolve();
        };
        xhr.open("PUT", `${signed.url}?part=${part}`);
        xhr.setRequestHeader("Content-Type", signed.mime);
        for (const [name, value] of Object.entries(signed.headers ?? {}))
          xhr.setRequestHeader(name, value);
        xhr.timeout = 240_000;
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable)
            onProgress(Math.min(99, Math.round(((offset + event.loaded) / file.size) * 100)));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            finish();
            return;
          }
          let message = "Your file could not be uploaded. Please try again.";
          try {
            message = JSON.parse(xhr.responseText).error || message;
          } catch {}
          finish(new Error(message));
        };
        xhr.onerror = () =>
          finish(
            new Error(
              "We couldn’t connect to the upload service. Check your connection and try again.",
            ),
          );
        xhr.ontimeout = () => finish(new Error("The upload took too long. Please try again."));
        xhr.onabort = () => finish(new Error("Upload cancelled. You can try again."));
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) {
          finish(new Error("Upload cancelled."));
          return;
        }
        xhr.send(body);
      });
    }
  } catch (error) {
    void fetch(signed.url, { method: "DELETE", headers: signed.headers }).catch(() => {});
    throw error;
  }
}
