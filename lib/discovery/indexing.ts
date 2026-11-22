import type { Search } from "./model";

/** Search, filters and pagination are navigation utilities, not standalone landing pages.
 * Curated /events/in/... and /events/category/... paths remain eligible for indexing.
 */
export function isFilteredListing(search: Search): boolean {
  return Object.values(search).some((value) =>
    (Array.isArray(value) ? value : [value]).some(
      (part) => typeof part === "string" && part.trim().length > 0,
    ),
  );
}
