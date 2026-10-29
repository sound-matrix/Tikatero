"use client";

import { useActionState } from "react";
import { updateProfile } from "@/app/(public)/me/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ProfileForm({ name, phone }: { name: string | null; phone: string | null }) {
  const [state, action, pending] = useActionState(updateProfile, {});
  return (
    <form action={action} className="space-y-5">
      <Input
        label="Your name"
        name="full_name"
        autoComplete="name"
        defaultValue={name ?? ""}
        maxLength={100}
        required
      />
      <Input
        label="Phone (optional)"
        name="phone"
        type="tel"
        autoComplete="tel"
        defaultValue={phone ?? ""}
        maxLength={25}
      />
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Saving…" : "Save details"}
      </Button>
      <p role="status" className={state.error ? "text-danger" : "text-teal"}>
        {state.error || state.success}
      </p>
    </form>
  );
}
