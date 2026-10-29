import "server-only";
import { cookies } from "next/headers";
import { filters, type Search } from "./model";
export async function locationFilters(search: Search) {
  let saved = {};
  if (search.city === undefined && search.country === undefined) {
    try {
      const value = JSON.parse((await cookies()).get("tikatero-location")?.value ?? "{}");
      saved = { city: value.city, country: value.country };
    } catch {
      /* Invalid or expired preference falls back to anywhere. */
    }
  }
  return filters({ ...saved, ...search });
}
