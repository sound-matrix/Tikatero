"use client";

import { useId, type ComponentProps } from "react";
import { cn } from "@/lib/cn";

type InputProps = ComponentProps<"input"> & {
  label: string;
  hint?: string;
  error?: string;
};

export function Input({ label, hint, error, id, className, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="block">
      <label htmlFor={inputId} className="mb-1.5 block font-semibold text-ink">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "min-h-12 w-full rounded-xl border-[1.5px] border-line bg-white px-3.5 text-base text-ink outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:bg-soft",
          error ? "border-danger" : "",
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={errorId} className="mt-1.5 text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
