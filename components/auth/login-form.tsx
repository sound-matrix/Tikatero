"use client";

import { useState, type FormEvent } from "react";
import { requestSignInCode, verifySignInCode, signInWithPassword, setVerifiedPassword } from "@/app/(public)/login/actions";
import { withReturnPath } from "@/lib/auth/return-path";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

type Mode = "login" | "signup" | "setup";
type Role = "attendee" | "organiser";
export function LoginForm({
  linkError, initialHost, next, initialEmail,
}: {
  linkError: boolean; initialHost: boolean; next: string | null; initialEmail: string;
}) {
  const [role, setRole] = useState<Role>(initialHost ? "organiser" : "attendee");
  const [mode, setMode] = useState<Mode>(initialHost || initialEmail ? "signup" : "login");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [token, setToken] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    linkError ? "That sign-in link has expired or was already used. Please try again." : "",
  );
  function switchMode(value: Mode) {
    setMode(value);
    setSent(false);
    setToken("");
    setPassword("");
    setConfirm("");
    setMessage("");
  }
  const readyPassword = password.length >= 8 && password.length <= 128 && password === confirm;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "login") {
        const result = await signInWithPassword(email, password, next);
        if (result.error) setMessage(result.error);
        else if (result.ok) {
          window.location.assign(withReturnPath("/auth/complete", next));
          return;
        }
      } else {
        if (!readyPassword) {
          setMessage("Enter a matching password of at least 8 characters.");
          return;
        }
        const result = await requestSignInCode(email, role, next);
        if (result.error) setMessage(result.error);
        else {
          setSent(true);
          setMessage("We sent a 6-digit verification code to your email.");
        }
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
      const verified = await verifySignInCode(email, token);
      if (verified.error) {
        setMessage(verified.error);
      } else {
        const updated = await setVerifiedPassword(password);
        if (updated.error) setMessage(updated.error);
        else {
          window.location.assign(withReturnPath("/auth/complete", next));
          return;
        }
      }
    } catch {
      setMessage("We could not verify your code. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="mt-7">
      {!sent && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => switchMode("login")}
              aria-pressed={mode === "login"}
              className={`rounded-xl border-2 p-3 font-bold transition-colors ${mode === "login" ? "border-teal bg-teal/5" : "border-line hover:border-teal"}`}>
              Log in
            </button>
            <button type="button" onClick={() => switchMode("signup")}
              aria-pressed={mode === "signup"}
              className={`rounded-xl border-2 p-3 font-bold transition-colors ${mode === "signup" ? "border-teal bg-teal/5" : "border-line hover:border-teal"}`}>
              Sign up
            </button>
          </div>
          {mode === "signup" && (
            <div className="mb-5">
              <p className="mb-3 font-semibold text-ink">I want to…</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {([["attendee", "I want to buy tickets"], ["organiser", "I want to host events"]] as const).map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={role === value}
                    onClick={() => setRole(value)}
                    className={`min-h-20 rounded-xl border-2 p-4 text-left text-lg font-bold text-ink transition-colors ${role === value ? "border-teal bg-teal/5" : "border-line hover:border-teal"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {mode === "setup" && (
            <div className="mb-5">
              <h2 className="font-bold text-ink">Set up your password</h2>
              <p className="mt-1 text-sm text-muted">If you used an email code before, verify your email once and set a password for future logins.</p>
            </div>
          )}
          <form onSubmit={submit} className="space-y-4">
            <Input label="Email" name="email" type="email" placeholder="you@example.com"
              autoComplete="email" maxLength={254} required value={email} disabled={busy}
              onChange={(event) => setEmail(event.target.value)} />
            <Input label="Password" name="password" type="password" required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "login" ? undefined : 8} maxLength={128}
              value={password} disabled={busy} onChange={(event) => setPassword(event.target.value)} />
            {mode !== "login" && (
              <Input label="Confirm password" name="confirm_password" type="password" required
                autoComplete="new-password" minLength={8} maxLength={128}
                value={confirm} disabled={busy}
                onChange={(event) => setConfirm(event.target.value)} />
            )}
            <Button type="submit" variant="primary" disabled={busy} className="w-full">
              {busy ? "Please wait…" : mode === "login" ? "Log in" : mode === "signup" ? "Sign up and verify email" : "Send verification code"}
            </Button>
          </form>
          {mode === "login" && (
            <button type="button" className="mt-4 text-sm font-semibold text-teal underline"
              onClick={() => switchMode("setup")}>
              Forgot password or previously signed in by email code?
            </button>
          )}
          {mode === "setup" && (
            <button type="button" className="mt-4 text-sm font-semibold text-teal underline"
              onClick={() => switchMode("login")}>Back to login</button>
          )}
        </>
      )}
      {sent && (
        <form onSubmit={verify} className="space-y-4">
          <h2 className="text-xl font-bold text-ink">Confirm your email</h2>
          <p className="text-sm text-muted">Enter the 6-digit code sent to {email}. This is required for initial verification, not every login.</p>
          <Input label="6-digit code" name="code" inputMode="numeric"
            autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} minLength={6}
            required value={token} disabled={busy}
            onChange={(event) => setToken(event.target.value)} />
          <Button type="submit" variant="primary" disabled={busy} className="w-full">
            {busy ? "Verifying…" : "Verify and continue"}
          </Button>
          <button type="button" disabled={busy} className="text-sm font-semibold text-teal underline"
            onClick={() => { setSent(false); setToken(""); setMessage(""); }}>
            Change email or resend code
          </button>
        </form>
      )}
      <p role="status" aria-live="polite" className="mt-4 text-sm text-muted">{message}</p>
      <p className="mt-5 border-t border-line pt-4 text-sm font-semibold text-teal">
        Secure account access. Email verification is required when creating or recovering an account.
      </p>
    </Card>
  );
}
