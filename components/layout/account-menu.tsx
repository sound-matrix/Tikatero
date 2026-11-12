"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/(public)/me/actions";
import { withReturnPath } from "@/lib/auth/return-path";

export type HeaderAccount = {
  name: string;
  avatar: string | null;
  host: boolean;
  staff: boolean;
  blocked: boolean;
};

export function AccountMenu({ account }: { account: HeaderAccount | null }) {
  const path = usePathname();
  const search = useSearchParams().toString();
  const current = search ? `${path}?${search}` : path;
  if (!account)
    return (
      <Button href={withReturnPath("/login", current)} variant="secondary">
        Sign in
      </Button>
    );

  const initials = account.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  const items = account.blocked
    ? []
    : [
        { href: "/me", label: "My tickets" },
        { href: "/me/profile", label: "My profile" },
        ...(account.host ? [{ href: "/console", label: "Host console" }] : []),
        ...(account.staff ? [{ href: "/admin", label: "Admin" }] : []),
      ];
  return (
    <details className="relative">
      <summary
        aria-label="Account menu"
        className="flex size-12 cursor-pointer list-none items-center justify-center overflow-hidden rounded-full border border-line bg-soft font-bold uppercase text-teal focus-visible:outline-2 focus-visible:outline-teal [&::-webkit-details-marker]:hidden"
      >
        {account.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            src={account.avatar}
            width={48}
            height={48}
            className="size-full object-cover"
          />
        ) : (
          initials || "U"
        )}
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-48 rounded-xl border border-line bg-white p-2 shadow-lg">
        <p className="truncate px-3 py-2 text-sm font-bold">{account.name}</p>
        {items.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold hover:bg-soft"
            onClick={(event) => {
              const details = event.currentTarget.closest("details");
              if (details) details.open = false;
            }}
          >
            {label}
          </Link>
        ))}
        <form action={signOut}>
          <input type="hidden" name="next" value={current} />
          <button
            type="submit"
            className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-semibold hover:bg-soft"
          >
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
