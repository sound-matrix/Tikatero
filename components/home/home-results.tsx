"use client";

import { useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";

export function HomeResults() {
  const params = useSearchParams();
  const query = params.get("q")?.trim() ?? "";
  const city = params.get("city")?.trim() ?? "";
  const searching = query.length > 0 || city.length > 0;

  if (!searching) {
    return (
      <EmptyState
        title="Events will show up here"
        description="Search by name or pick a city. Published events will be listed on this page."
      />
    );
  }

  const where = [query ? `“${query.slice(0, 80)}”` : null, city || null]
    .filter(Boolean)
    .join(" in ");

  return (
    <EmptyState
      title="No events match that search"
      description={`Nothing is listed for ${where} yet. Try another name or city.`}
    />
  );
}
