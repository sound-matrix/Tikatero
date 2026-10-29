"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function DocumentPreview({ docKey, label }: { docKey: string; label: string }) {
  const [url, setUrl] = useState<string | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  async function open() {
    setLoading(true);
    setError("");
    setUrl(null);
    try {
      const response = await fetch("/api/uploads/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: docKey, ttlSeconds: 300 }),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || typeof data.url !== "string") throw new Error();
      setUrl(data.url);
    } catch {
      setError("This preview could not be opened. Try again.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="space-y-3">
      <Button onClick={open} disabled={loading}>
        {loading ? "Opening…" : `Preview ${label}`}
      </Button>
      {error && <p role="alert">{error}</p>}
      {url && (
        <>
          <object
            data={url}
            type={/\.pdf$/i.test(docKey) ? "application/pdf" : undefined}
            aria-label={label}
            className="h-96 w-full rounded-xl border border-line"
          />
          <a href={url} target="_blank" rel="noreferrer" className="text-teal underline">
            Open {label} in a new tab
          </a>
          <p className="text-sm text-muted">
            Private preview expires in 5 minutes. Open it again to refresh.
          </p>
        </>
      )}
    </div>
  );
}
