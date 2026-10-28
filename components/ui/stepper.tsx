"use client";

type Step = {
  label: string;
};

export function Stepper({
  steps,
  current,
  onChange,
}: {
  steps: readonly Step[];
  current: number;
  onChange?: (index: number) => void;
}) {
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Steps">
      {steps.map((step, index) => {
        const active = index === current;
        return (
          <li key={step.label}>
            <button
              type="button"
              aria-current={active ? "step" : undefined}
              onClick={() => onChange?.(index)}
              className={
                active
                  ? "inline-flex min-h-11 items-center rounded-full bg-ink px-3.5 font-semibold text-white"
                  : "inline-flex min-h-11 items-center rounded-full bg-soft px-3.5 font-semibold text-ink"
              }
            >
              {index + 1}. {step.label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
