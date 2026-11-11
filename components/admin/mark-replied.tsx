"use client";

import { useActionState } from "react";
import { markContactReplied, type MarkState } from "@/app/admin/messages/actions";
import { Button } from "@/components/ui/button";

const initialState: MarkState = {};

export function MarkReplied({ id }: { id: string }) {
  const [state, action, pending] = useActionState(markContactReplied, initialState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="trust" disabled={pending}>
        {pending ? "Saving…" : "Mark as replied"}
      </Button>
      {state.error ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
