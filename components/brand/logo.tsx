import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" aria-label="Tikatero home" className="inline-flex shrink-0">
      <Image
        src="/brand/tikatero-logo.svg"
        alt="Tikatero"
        width={195}
        height={52}
        priority
        unoptimized
        className={cn("h-11 w-auto md:h-[52px]", className)}
      />
    </Link>
  );
}
