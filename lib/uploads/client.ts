"use client";

import type { SignedUpload } from "./policy";

// File is sent directly to R2, not through a Vercel function. XHR exposes upload progress.
export function putFile(
  file: File,
  signed: SignedUpload,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const finish = (error?: Error) => {
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve();
    };
    xhr.open("PUT", signed.url);
    xhr.setRequestHeader("Content-Type", signed.mime);
    // The browser supplies Content-Length from the File; setting it manually is forbidden.
    xhr.timeout = 240_000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? finish()
        : finish(
            new Error(
              xhr.status === 403
                ? "This upload link has expired or could not be used. Please try again."
                : "Your file could not be uploaded. Please try again.",
            ),
          );
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
    xhr.send(file);
  });
}
