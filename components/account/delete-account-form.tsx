"use client";

import { useActionState } from "react";
import { deleteMyAccount } from "@/lib/refunds/actions";
import { Button } from "@/components/ui/button";

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState(deleteMyAccount, {});
  return (
    <form action={action} className="space-y-4">
      <label className="flex items-start gap-3">
        <input className="mt-1" type="checkbox" name="confirm_delete" value="yes" required />
        <span>I understand this deletes my account and signs me out.</span>
      </label>
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Deleting…" : "Delete my account"}
      </Button>
      {state.error && <p className="text-danger">{state.error}</p>}
    </form>
  );
}
