"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { acceptInvitation } from "./actions";

export function AcceptForm({ token }: { token: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await acceptInvitation(token);
    if (result.error || !result.path) {
      setError(result.error ?? "This invitation could not be accepted.");
      setBusy(false);
      return;
    }
    window.location.assign(result.path);
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      {error && <p className="font-semibold text-danger">{error}</p>}
      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? "Joining…" : "Join the team"}
      </Button>
    </form>
  );
}
