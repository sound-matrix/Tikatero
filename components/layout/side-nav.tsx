"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/cn";

type Item = {
  href: ComponentProps<typeof Link>["href"];
  label: string;
  count?: number;
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
    <aside className="border-b border-line bg-white md:w-64 md:shrink-0 md:border-r md:border-b-0">
      <div className="flex flex-col gap-3 px-4 py-4">
        <Logo className="h-10 md:h-11" />
        <p className="text-sm font-semibold text-muted">{title}</p>
        <nav aria-label={title} className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {items.map((item) => {
            const href = String(item.href);
            const active = href === activePath ||
              (href === "/console/tools/instagram" && /^\/console\/events\/[0-9a-f-]{36}\/instagram$/i.test(activePath)) ||
              (href === "/console/tools/edit" && /^\/console\/events\/[0-9a-f-]{36}\/edit$/i.test(activePath)) ||
              (href === "/console/tools/team" && /^\/console\/events\/[0-9a-f-]{36}\/team$/i.test(activePath)) ||
              (href === "/console/tools/scan" && /^\/console\/events\/[0-9a-f-]{36}\/scan$/i.test(activePath)) ||
              (href === "/console/tools/sales" && /^\/console\/events\/[0-9a-f-]{36}$/i.test(activePath));
            return (
              <Link
                key={href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold leading-5 transition-colors md:w-full",
                  active ? "bg-soft text-ink" : "text-ink hover:bg-soft",
                )}
              >
                <span>{item.label}</span>
                {!!item.count && (
                  <span
                    aria-label={`${item.count} pending removal requests`}
                    className="ml-2 rounded-full bg-teal-soft px-2 py-0.5 text-xs font-bold text-teal"
                  >
                    {item.count}
                  </span>
                )}
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
