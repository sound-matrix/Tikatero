"use client";

import { useState, type FormEvent } from "react";
import { requestSignInCode, verifySignInCode } from "@/app/(public)/login/actions";
import { withReturnPath } from "@/lib/auth/return-path";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export function LoginForm({
  linkError,
  initialHost,
  next,
  initialEmail,
}: {
  linkError: boolean;
  initialHost: boolean;
  next: string | null;
  initialEmail: string;
}) {
  const [choice, setChoice] = useState<"attendee" | "organiser" | "existing" | null>(
    initialHost ? "organiser" : initialEmail ? "attendee" : null,
  );
  const [email, setEmail] = useState(initialEmail);
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
      const result = await requestSignInCode(
        email,
        choice === "organiser" ? "organiser" : "attendee",
        next,
      );
      if (result.error) setMessage(result.error);
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
      const result = await verifySignInCode(email, token);
      if (result.error) setMessage(result.error);
      else {
        // A document navigation discards any anonymous prefetched RSC/session state.
        window.location.assign(withReturnPath("/auth/complete", next));
        return;
      }
    } catch {
      setMessage("Sign-in is temporarily unavailable. Please try again.");
    }
    setBusy(false);
  }

  return (
    <Card className="mt-7">
      {!sent && choice !== "existing" && (
        <div className="mb-6">
          <p className="mb-3 font-semibold text-ink">I want to…</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["attendee", "I want to buy tickets"],
                ["organiser", "I want to host events"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={choice === value}
                onClick={() => setChoice(value)}
                className={`min-h-20 rounded-xl border-2 p-4 text-left text-lg font-bold text-ink transition-colors ${choice === value ? "border-teal bg-teal/5" : "border-line hover:border-teal"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setChoice("existing")}
            className="mt-4 text-left text-sm font-semibold text-teal underline"
          >
            Already have an account? Just enter your email
          </button>
        </div>
      )}
      {!sent && choice === "existing" && (
        <div className="mb-5 text-sm">
          <p className="text-muted">Already have an account? Just enter your email.</p>
          <button
            type="button"
            onClick={() => setChoice(null)}
            className="mt-2 font-semibold text-teal underline"
          >
            Go back to sign-up choices
          </button>
        </div>
      )}
      <form onSubmit={send} className="space-y-4">
        {choice && (
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
        )}
        {!sent && choice && (
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
