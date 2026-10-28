"use client";

import { useId, type ComponentProps } from "react";
import { cn } from "@/lib/cn";

type SelectProps = ComponentProps<"select"> & {
  label: string;
  hint?: string;
  error?: string;
  options: readonly { value: string; label: string }[];
};

export function Select({ label, hint, error, options, id, className, ...props }: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const hintId = hint ? `${selectId}-hint` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="block">
      <label htmlFor={selectId} className="mb-1.5 block font-semibold text-ink">
        {label}
      </label>
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "min-h-12 w-full rounded-xl border-[1.5px] border-line bg-white px-3.5 text-base text-ink outline-none disabled:cursor-not-allowed disabled:bg-soft",
          error ? "border-danger" : "",
          className,
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
