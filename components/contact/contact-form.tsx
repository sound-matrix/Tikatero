"use client";

import { useActionState, useEffect, useRef } from "react";
import { submitContact, type ContactFormState } from "@/app/(public)/contact/actions";
import { Turnstile } from "@/components/checkout/turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { contactTopics } from "@/lib/contact/topics";

const initialState: ContactFormState = {};

export function ContactForm({ turnstileSiteKey }: { turnstileSiteKey: string }) {
  const [state, action, pending] = useActionState(submitContact, initialState);
  const startedRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = startedRef.current;
    if (input && !input.value) input.value = String(Date.now());
  }, []);

  if (state.success) {
    return (
      <p
        role="status"
        className="mt-8 rounded-2xl border border-line bg-teal-soft p-6 text-lg text-ink"
      >
        {`Thanks, ${state.success.firstName}! We've got your message and will reply to ${state.success.email}.`}
      </p>
    );
  }

  return (
    <form action={action} className="mt-8 space-y-4">
      <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
        <label>
          Company website
          <input name="company_website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <input ref={startedRef} type="hidden" name="started" defaultValue="" />
      <Input
        label="Full name"
        name="name"
        autoComplete="name"
        required
        maxLength={120}
        error={state.fields?.name}
      />
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        error={state.fields?.email}
      />
      <Input
        label="Phone"
        name="phone"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        maxLength={20}
        hint="Optional. An Indian mobile number, with +91 if you like."
        error={state.fields?.phone}
      />
      <Select
        label="What is it about?"
        name="topic"
        required
        defaultValue=""
        error={state.fields?.topic}
        options={[{ value: "", label: "Choose one" }, ...contactTopics]}
      />
      <Input
        label="Order or ticket ID"
        name="order_ref"
        maxLength={80}
        hint="Optional."
        error={state.fields?.orderRef}
      />
      <div>
        <label htmlFor="contact-message" className="mb-1.5 block font-semibold text-ink">
          Message
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          minLength={10}
          maxLength={2000}
          rows={6}
          aria-invalid={state.fields?.message ? true : undefined}
          aria-describedby={
            state.fields?.message ? "contact-message-error" : "contact-message-hint"
          }
          className="min-h-32 w-full rounded-xl border-[1.5px] border-line bg-white px-3.5 py-3 text-base text-ink outline-none"
        />
        {state.fields?.message ? (
          <p id="contact-message-error" className="mt-1.5 text-sm font-semibold text-danger">
            {state.fields.message}
          </p>
        ) : (
          <p id="contact-message-hint" className="mt-1.5 text-sm text-muted">
            At least 10 characters.
          </p>
        )}
      </div>
      {turnstileSiteKey ? (
        <Turnstile siteKey={turnstileSiteKey} generation={0} action="contact" />
      ) : null}
      {state.error ? (
        <p role="alert" className="font-semibold text-danger">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" className="w-full sm:w-auto" disabled={pending}>
        {pending ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
