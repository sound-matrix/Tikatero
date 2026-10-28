import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const variants = {
  verified: "bg-teal-soft text-teal",
  vip: "bg-gold-soft text-gold-ink",
} as const;

export type BadgeVariant = keyof typeof variants;

export function Badge({
  variant,
  children,
  className,
}: {
  variant: BadgeVariant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-bold",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
