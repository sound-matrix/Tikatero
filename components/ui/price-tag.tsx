import { cn } from "@/lib/cn";
import { formatInr } from "@/lib/format";

export function PriceTag({ paise, className }: { paise: number; className?: string }) {
  return (
    <p className={cn("text-ink", className)}>
      <span className="text-[22px] font-extrabold">{formatInr(paise)}</span>{" "}
      <span className="text-sm font-semibold text-muted">incl. GST</span>
    </p>
  );
}
