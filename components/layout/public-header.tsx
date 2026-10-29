"use client";

import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function PublicHeader() {
  const pathname = usePathname();
  const inAccount = pathname === "/blocked" || pathname === "/me" || pathname.startsWith("/me/");

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:px-6">
        <div className="flex items-center justify-between gap-3">
          <Logo />
          <div className="md:hidden">
            <Button href={inAccount ? "/me" : "/login"} variant="secondary">
              {inAccount ? "Your account" : "Sign in"}
            </Button>
          </div>
        </div>
        <nav
          aria-label="Main navigation"
          className="flex flex-1 items-center justify-end gap-5 text-sm font-semibold"
        >
          <Link href="/events">Find events</Link>
          <Link href="/console">Host an event</Link>
        </nav>
        <div className="hidden md:block">
          <Button href={inAccount ? "/me" : "/login"} variant="secondary">
            {inAccount ? "Your account" : "Sign in"}
          </Button>
        </div>
      </div>
    </header>
  );
}

export function PublicHeaderFallback() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-white">
      <div className="mx-auto flex h-[76px] w-full max-w-6xl items-center px-4 md:px-6">
        <Logo />
      </div>
    </header>
  );
}
