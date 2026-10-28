"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="w-[min(100%-2rem,32rem)] rounded-2xl border border-line bg-white p-0 text-ink"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <h2 id={titleId} className="text-xl font-bold">
          {title}
        </h2>
        <button
          type="button"
          className="inline-flex min-h-12 items-center rounded-xl border-[1.5px] border-line px-4 font-semibold"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
    </dialog>
  );
}
