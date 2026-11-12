"use client";

import { useId, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

function Submit({ label, danger }: { label: string; danger: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant={danger ? "danger" : "primary"}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function ModerationDialog({
  label,
  title,
  submitLabel = label,
  danger = false,
  children,
  action,
}: {
  label: string;
  title?: string;
  submitLabel?: string;
  danger?: boolean;
  children: React.ReactNode;
  action: (formData: FormData) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  return (
    <>
      <Button variant={danger ? "danger" : "secondary"} onClick={() => dialog.current?.showModal()}>
        {label}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={heading}
        className="m-auto w-[min(calc(100%-2rem),32rem)] max-w-none overflow-y-auto rounded-2xl border border-line bg-white p-6 text-ink shadow-xl backdrop:bg-ink/50"
      >
        <h3 id={heading} className="text-xl font-bold">
          {title ?? label}
        </h3>
        <form action={action} className="mt-4 space-y-4">
          {children}
          <div className="flex flex-wrap gap-3">
            <Submit label={submitLabel} danger={danger} />
            <Button onClick={() => dialog.current?.close()}>Go back</Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
