import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-line bg-white p-[18px]", className)}>
      {children}
    </div>
  );
}
