"use client";

import { useActionState } from "react";
import { becomeOrganiser } from "@/app/(public)/me/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function OrganiserForm() {
  const [state, action, pending] = useActionState(becomeOrganiser, {});
  return (
    <form action={action} className="mt-5 space-y-4">
      <Input label="Organiser name" name="display_name" maxLength={100} required />
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Creating…" : "Become an organiser"}
      </Button>
      <p role="status" className="text-danger">
        {state.error}
      </p>
    </form>
  );
}
