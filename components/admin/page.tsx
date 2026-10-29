import Link from "next/link";
import type { ReactNode } from "react";
export function AdminPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 md:px-8">
      <header>
        <p className="mb-2 text-sm font-bold uppercase tracking-widest text-teal">
          Staff workspace
        </p>
        <h1 className="text-3xl font-extrabold text-ink">{title}</h1>
        <p className="mt-2 text-muted">{description}</p>
      </header>
      {children}
    </main>
  );
}
export function Pager({
  page,
  hasMore,
  path,
  params = {},
}: {
  page: number;
  hasMore: boolean;
  path: string;
  params?: Record<string, string>;
}) {
  const href = (p: number) => `${path}?${new URLSearchParams({ ...params, page: String(p) })}`;
  return (
    <nav aria-label="Results pages" className="flex items-center gap-5 py-4">
      {page > 1 && (
        <Link className="text-teal underline" href={href(page - 1)}>
          Previous
        </Link>
      )}
      <span className="text-sm text-muted">Page {page}</span>
      {hasMore && (
        <Link className="text-teal underline" href={href(page + 1)}>
          Next
        </Link>
      )}
    </nav>
  );
}
