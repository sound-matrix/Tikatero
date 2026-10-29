"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export function LoginForm({ linkError }: { linkError: boolean }) {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    linkError ? "That sign-in link has expired or was already used. Please request a new one." : "",
  );

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const client = createClient();
      const { error } = await client.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) setMessage("We could not send your email. Please wait a minute and try again.");
      else {
        setSent(true);
        setMessage(
          "Check your email for your sign-in details. You can enter the 6-digit code or use the sign-in link.",
        );
      }
    } catch {
      setMessage("Sign-in is temporarily unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(token)) {
      setMessage("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const { error } = await createClient().auth.verifyOtp({
        email: email.trim(),
        token,
        type: "email",
      });
      if (error)
        setMessage("That code is incorrect or has expired. Try again or request a new email.");
      else {
        // A document navigation discards any anonymous prefetched RSC/session state.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/auth/complete");
        return;
      }
    } catch {
      setMessage("Sign-in is temporarily unavailable. Please try again.");
    }
    setBusy(false);
  }

  return (
    <Card className="mt-7">
      <form onSubmit={send} className="space-y-4">
        <Input
          label="Email"
          name="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          maxLength={254}
          required
          value={email}
          disabled={busy || sent}
          onChange={(event) => setEmail(event.target.value)}
        />
        {!sent && (
          <Button type="submit" variant="primary" disabled={busy} className="w-full">
            {busy ? "Sending…" : "Email me a code or sign-in link"}
          </Button>
        )}
      </form>
      {sent && (
        <form onSubmit={verify} className="mt-5 space-y-4">
          <Input
            label="6-digit code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            minLength={6}
            required
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
          <Button type="submit" variant="primary" disabled={busy} className="w-full">
            {busy ? "Checking…" : "Sign in"}
          </Button>
          <Button
            disabled={busy}
            className="w-full"
            onClick={() => {
              setSent(false);
              setToken("");
              setMessage("");
            }}
          >
            Change email or request a new code
          </Button>
        </form>
      )}
      <p role="status" aria-live="polite" className="mt-4 text-sm text-muted">
        {message}
      </p>
      <p className="mt-5 border-t border-line pt-4 text-sm font-semibold text-teal">
        Secure sign-in. No password to remember.
      </p>
    </Card>
  );
}
