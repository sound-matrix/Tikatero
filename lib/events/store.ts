import "server-only";
import { settingsFromRules, type Rule } from "@/lib/refunds/rules";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/db/types";
import { knownCategory, readCategoryDetails } from "./category-details";
import { emptyValues, toIstInput, priceText, type Values } from "./model";
import { storagePublicBase } from "@/lib/uploads/public-base";
export type Draft = {
  id: string;
  organiserId: string;
  revision: number;
  step: number;
  completed: number[];
  slug: string;
  status: string;
  hiddenAt?: string | null;
  values: Values;
};
export function rowValues(
  row: Pick<
    Tables<"events">,
    | "title"
    | "category"
    | "details"
    | "is_unlisted"
    | "description"
    | "theme"
    | "is_free"
    | "starts_at"
    | "ends_at"
    | "gates_open_at"
    | "venue_name"
    | "address"
    | "city"
    | "country"
    | "maps_url"
    | "lat"
    | "lng"
    | "poster_key"
    | "capacity"
    | "fee_payer"
    | "refund_policy"
    | "refund_auto_approve"
  >,
  guests: Tables<"event_guests">[],
  tiers: Tables<"ticket_types">[],
  rules: Rule[] = [],
): Values {
  const initial = emptyValues();
  return {
    ...initial,
    title: row.title,
    category: knownCategory(row.category) ?? "Other",
    details: readCategoryDetails(row.category, row.details),
    isUnlisted: row.is_unlisted,
    description: row.description ?? "",
    theme:
      (row.theme ?? "none") in { diwali: 1, christmas: 1, new_year: 1 }
        ? (row.theme as Values["theme"])
        : "none",
    free: row.is_free,
    startsAt: toIstInput(row.starts_at),
    endsAt: toIstInput(row.ends_at),
    gatesAt: toIstInput(row.gates_open_at),
    venue: row.venue_name ?? "",
    address: row.address ?? "",
    city: row.city ?? "",
    country: row.country,
    mapsUrl: row.maps_url ?? "",
    lat: row.lat === null ? "" : String(row.lat),
    lng: row.lng === null ? "" : String(row.lng),
    posterKey: row.poster_key?.startsWith("media/") ? row.poster_key : "",
    guests: guests.map((g) => ({
      id: g.id,
      name: g.name,
      title: g.title ?? "",
      photoKey: g.photo_key?.startsWith("media/") ? g.photo_key : "",
      vip: g.is_vip,
    })),
    capacity: row.capacity === null ? "" : String(row.capacity),
    tiers: tiers.map((t) => ({
      id: t.id,
      name: t.name,
      price: priceText(t.price_paise),
      quantity: String(t.qty_total),
      perOrderMax: t.per_order_max === null ? "" : String(t.per_order_max),
      salesStart: toIstInput(t.sales_start),
      salesEnd: toIstInput(t.sales_end),
      vip: t.is_vip,
    })),
    feePayer: row.fee_payer,
    ...settingsFromRules(row.refund_policy, rules, row.refund_auto_approve ?? false),
  };
}
export async function readDraft(
  client: SupabaseClient<Database>,
  id: string,
): Promise<Draft | null> {
  const [
    { data: row, error },
    { data: guests, error: guestError },
    { data: tiers, error: tierError },
    { data: rules, error: rulesError },
  ] = await Promise.all([
    client
      .from("events")
      .select(
        "id, organiser_id, slug, title, status, category, details, is_unlisted, description, theme, is_free, starts_at, ends_at, gates_open_at, venue_name, address, city, country, maps_url, lat, lng, poster_key, capacity, fee_payer, refund_policy, refund_auto_approve, wizard_revision, wizard_step, wizard_completed_steps, hidden_at",
      )
      .eq("id", id)
      .maybeSingle(),
    client.from("event_guests").select("*").eq("event_id", id).order("sort"),
    client.from("ticket_types").select("*").eq("event_id", id).order("sort"),
    client.from("event_refund_rules").select("min_hours_before, refund_percent").eq("event_id", id),
  ]);
  if (error || guestError || tierError || rulesError)
    throw new Error("Your saved event could not be loaded. Try again.");
  if (!row) return null;
  return {
    id: row.id,
    organiserId: row.organiser_id,
    revision: row.wizard_revision,
    step: row.wizard_step,
    completed: row.wizard_completed_steps,
    slug: row.slug,
    status: row.status,
    hiddenAt: row.hidden_at,
    values: rowValues(row, guests ?? [], tiers ?? [], rules ?? []),
  };
}
export function publicMediaBase() {
  return storagePublicBase(process.env.NEXT_PUBLIC_SUPABASE_URL);
}
export function uploadsReady() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() && publicMediaBase());
}
