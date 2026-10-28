"use client";

import { useSearchParams } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cities } from "@/lib/cities";

export function PublicHeader() {
  const params = useSearchParams();
  const query = params.get("q") ?? "";
  const city = params.get("city") ?? "";

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:px-6">
        <div className="flex items-center justify-between gap-3">
          <Logo />
          <div className="md:hidden">
            <Button href="/login" variant="secondary">
              Sign in
            </Button>
          </div>
        </div>
        <form
          action="/"
          method="get"
          role="search"
          className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center"
          key={`${query}:${city}`}
        >
          <label className="sr-only" htmlFor="site-search">
            Search
          </label>
          <input
            id="site-search"
            name="q"
            defaultValue={query}
            placeholder="Search events, artists, venues"
            className="min-h-12 w-full flex-1 rounded-xl border-[1.5px] border-line px-3.5 text-base text-ink"
          />
          <label className="sr-only" htmlFor="site-city">
            City
          </label>
          <select
            id="site-city"
            name="city"
            defaultValue={city}
            className="min-h-12 w-full rounded-xl border-[1.5px] border-line bg-white px-3.5 text-base text-ink sm:w-44"
          >
            <option value="">All cities</option>
            {cities.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <Button type="submit" variant="primary">
            Search
          </Button>
        </form>
        <div className="hidden md:block">
          <Button href="/login" variant="secondary">
            Sign in
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
