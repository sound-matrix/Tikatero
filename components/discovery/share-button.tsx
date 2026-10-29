"use client";
import { useState } from "react";
export function ShareButton({ title }: { title: string }) {
  const [message, setMessage] = useState("");
  async function share() {
    const url = window.location.origin + window.location.pathname;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setMessage("Link copied");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(`Copy this link: ${url}`);
    }
  }
  return (
    <div>
      <button onClick={share} className="min-h-12 rounded-xl border border-line px-5 font-semibold">
        Share event
      </button>
      <p role="status" className="mt-1 break-all text-sm text-muted">
        {message}
      </p>
    </div>
  );
}
