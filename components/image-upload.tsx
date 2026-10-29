"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { validateFile, type SignedUpload, type UploadKind } from "@/lib/uploads/policy";
import { putFile } from "@/lib/uploads/client";

type UploadResult = Pick<SignedUpload, "key" | "publicUrl">;
export type ImageUploadProps = {
  kind: UploadKind;
  entityId: string;
  label?: string;
  onUpload?: (result: UploadResult) => void;
};

export function ImageUpload({ kind, entityId, label, onUpload }: ImageUploadProps) {
  const document = kind === "kyc_doc";
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "signing" | "uploading" | "done">("idle");
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const busy = status === "signing" || status === "uploading";

  function selectFile(selected: File | undefined) {
    setError("");
    setProgress(0);
    setStatus("idle");
    setFile(null);
    setPreview(null);
    if (!selected) return;
    try {
      validateFile(kind, selected.type, selected.size);
      setFile(selected);
      if (selected.type.startsWith("image/")) setPreview(URL.createObjectURL(selected));
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Please choose another file.");
    }
  }

  async function upload() {
    if (!file || busy) return;
    const request = new AbortController();
    controller.current = request;
    setError("");
    setProgress(0);
    setStatus("signing");
    let result: UploadResult;
    try {
      const response = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, entityId, mime: file.type, size: file.size }),
        signal: request.signal,
      }).catch(() => {
        throw new Error(
          "We couldn’t connect to the upload service. Check your connection and try again.",
        );
      });
      const signed = (await response.json().catch(() => {
        throw new Error("Your upload could not be started. Please try again.");
      })) as SignedUpload & { error?: string };
      if (!response.ok)
        throw new Error(signed.error || "Your upload could not be started. Please try again.");
      if (typeof signed.url !== "string" || typeof signed.key !== "string")
        throw new Error("Your upload could not be started. Please try again.");
      setStatus("uploading");
      await putFile(file, signed, setProgress, request.signal);
      setProgress(100);
      setStatus("done");
      // Do not hand presigned URLs to callers or store them as a permanent asset URL.
      result = { key: signed.key, ...(signed.publicUrl ? { publicUrl: signed.publicUrl } : {}) };
    } catch (issue) {
      if (!request.signal.aborted) {
        setError(
          issue instanceof Error
            ? issue.message
            : "Your file could not be uploaded. Please try again.",
        );
        setStatus("idle");
      }
      return;
    } finally {
      if (controller.current === request) controller.current = null;
    }
    onUpload?.(result);
  }

  return (
    <Card className="max-w-xl">
      <h3 className="text-lg font-bold text-ink">
        {label ?? (document ? "Upload a verification document" : "Upload a photo")}
      </h3>
      <p className="mt-2 text-sm text-muted">
        {document ? "JPG, PNG, WebP or PDF · up to 10 MB" : "JPG, PNG or WebP · up to 5 MB"}
      </p>
      <div className="mt-5 flex min-h-48 items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-soft px-4 py-5">
        {preview ? (
          <Image
            src={preview}
            width={480}
            height={260}
            unoptimized
            alt="Selected photo preview"
            className="max-h-64 w-full rounded-lg object-contain"
          />
        ) : (
          <div className="text-center text-muted">
            <span aria-hidden="true" className="text-4xl">
              ↑
            </span>
            <p className="mt-2">
              {file ? "Your document is ready to upload" : "Choose a file to see it here"}
            </p>
          </div>
        )}
      </div>
      <div className="mt-5">
        <Input
          label={document ? "Choose a photo or PDF" : "Choose a photo"}
          type="file"
          accept={
            document
              ? "image/jpeg,image/png,image/webp,application/pdf"
              : "image/jpeg,image/png,image/webp"
          }
          disabled={busy}
          onChange={(event) => {
            selectFile(event.target.files?.[0]);
          }}
        />
      </div>
      {file && (
        <p className="mt-3 truncate text-sm text-muted" title={file.name}>
          {file.name}
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={!file || busy || status === "done"} onClick={upload}>
          {status === "signing"
            ? "Getting ready…"
            : status === "uploading"
              ? "Uploading…"
              : status === "done"
                ? "Uploaded"
                : "Upload file"}
        </Button>
        <span className="text-sm font-semibold text-teal">
          {document ? "Private · only Tikatero staff can open it" : "Secure upload"}
        </span>
      </div>
      {(busy || status === "done") && (
        <div className="mt-5">
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="h-2.5 overflow-hidden rounded-full bg-soft"
          >
            <div
              className="h-full rounded-full bg-teal transition-[width] motion-reduce:transition-none"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-muted">
            {status === "signing" ? "Preparing your secure upload…" : `${progress}% uploaded`}
          </p>
        </div>
      )}
      <p
        role="status"
        aria-live="polite"
        className={`mt-4 text-sm ${error ? "text-danger" : "text-teal"}`}
      >
        {error || (status === "done" ? "Your file has been uploaded." : "")}
      </p>
    </Card>
  );
}
