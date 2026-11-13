import "server-only";
import { cache } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { createAnonClient } from "@/lib/supabase/anon";
import type { Database } from "@/lib/db/types";
import { istDayStart, istDayEnd, type Filters, type Guest, type Tier } from "./model";
export type PublicEvent = Omit<
  Database["public"]["Views"]["discovery_events"]["Row"],
  "tiers" | "guests"
> & { tiers: Tier[]; guests: Guest[] };
type LinkedEvent = PublicEvent & { is_unlisted: boolean };
export const PAGE_SIZE = 12;
function configured() {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
  );
}
function event<T extends Database["public"]["Views"]["discovery_events"]["Row"]>(row: T) {
  return {
    ...row,
    tiers: row.tiers as unknown as Tier[],
    guests: row.guests as unknown as Guest[],
  };
}
/** ISR data cache: validated filter values are part of the cache key. No session state. */
export async function discover(input: Filters, trending = false) {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 300 });
  cacheTag("public-events");
  if (!configured()) return { events: [] as PublicEvent[], total: 0, unavailable: false };
  let query = createAnonClient().from("discovery_events").select("*", { count: "exact" });
  if (input.q) query = query.ilike("title", `%${input.q.replace(/[\\%_]/g, "\\$&")}%`);
  if (input.city) query = query.ilike("city", input.city.replace(/[\\%_]/g, "\\$&"));
  if (input.country) query = query.eq("country", input.country);
  if (input.category) query = query.eq("category", input.category);
  if (input.price) query = query.eq("is_free", input.price === "free");
  if (input.from) query = query.gte("starts_at", istDayStart(input.from));
  if (input.to) query = query.lt("starts_at", istDayEnd(input.to));
  if (trending) query = query.order("tickets_sold", { ascending: false });
  query = query
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id");
  const offset = (input.page - 1) * PAGE_SIZE;
  const { data, count, error } = await query.range(offset, offset + (trending ? 6 : PAGE_SIZE) - 1);
  return { events: (data ?? []).map(event), total: count ?? 0, unavailable: !!error };
}
/** Detail is request-fresh: pausing/unpublishing never serves a cached event or book link. */
export const publicEvent = cache(async (slug: string): Promise<LinkedEvent | null> => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 160 || !configured()) return null;
  const { data, error } = await createAnonClient()
    .rpc("public_event_by_slug", { p_slug: slug })
    .maybeSingle();
  if (error) throw new Error("This event could not be loaded. Please try again.");
  return data ? event(data) : null;
});

export async function requestTime() {
  return Date.now();
}

/** The sitemap uses the same visibility rules as browse and search. */
export async function sitemapEventSlugs() {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 300 });
  cacheTag("public-events");
  if (!configured()) return [];
  const client = createAnonClient();
  const slugs: string[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from("discovery_events")
      .select("slug")
      .order("slug")
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error("The event sitemap could not be loaded.");
    slugs.push(...data.map(({ slug }) => slug));
    if (data.length < pageSize) return slugs;
  }
}
