"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/cn";

type Item = {
  href: ComponentProps<typeof Link>["href"];
  label: string;
};

export function SideNav({
  title,
  items,
  current,
}: {
  title: string;
  items: readonly Item[];
  current?: string;
}) {
  const pathname = usePathname();
  const activePath = current ?? pathname;

  return (
    <aside className="border-b border-line bg-white md:w-60 md:shrink-0 md:border-r md:border-b-0">
      <div className="flex flex-col gap-4 px-4 py-4">
        <Logo className="h-10 md:h-11" />
        <p className="text-sm font-semibold text-muted">{title}</p>
        <nav aria-label={title} className="flex gap-1 overflow-x-auto md:flex-col">
          {items.map((item) => {
            const href = String(item.href);
            const active = href === activePath;
            return (
              <Link
                key={href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-12 shrink-0 items-center rounded-xl px-3 font-semibold",
                  active ? "bg-soft text-ink" : "text-ink hover:bg-soft",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Link href="/" className="inline-flex min-h-12 items-center font-semibold text-ink">
          Find events
        </Link>
        <Link href="/me" className="inline-flex min-h-12 items-center font-semibold text-teal">
          Your account
        </Link>
      </div>
    </aside>
  );
}
