import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/db/types";
import { categories, emptyValues, toIstInput, priceText, type Values } from "./model";
import { parsePublicBaseUrl } from "@/lib/uploads/public-base";
export type Draft = {
  id: string;
  organiserId: string;
  revision: number;
  step: number;
  completed: number[];
  slug: string;
  status: string;
  values: Values;
};
export function rowValues(
  row: Tables<"events">,
  guests: Tables<"event_guests">[],
  tiers: Tables<"ticket_types">[],
): Values {
  const initial = emptyValues();
  const refund = row.refund_policy;
  return {
    ...initial,
    title: row.title,
    category: (categories as readonly string[]).includes(row.category ?? "")
      ? row.category!
      : "Other",
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
    posterKey: row.poster_key ?? "",
    guests: guests.map((g) => ({
      id: g.id,
      name: g.name,
      title: g.title ?? "",
      photoKey: g.photo_key ?? "",
      vip: g.is_vip,
    })),
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
    refundPolicy: refund === "72h" ? "72h" : refund === "none" ? "none" : "custom",
    refundText: refund.startsWith("custom: ")
      ? refund.slice(8)
      : ["72h", "none"].includes(refund)
        ? ""
        : refund,
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
  ] = await Promise.all([
    client.from("events").select("*").eq("id", id).maybeSingle(),
    client.from("event_guests").select("*").eq("event_id", id).order("sort"),
    client.from("ticket_types").select("*").eq("event_id", id).order("sort"),
  ]);
  if (error || guestError || tierError)
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
    values: rowValues(row, guests ?? [], tiers ?? []),
  };
}
export function publicMediaBase() {
  try {
    return process.env.R2_PUBLIC_BASE_URL
      ? parsePublicBaseUrl(process.env.R2_PUBLIC_BASE_URL).href
      : null;
  } catch {
    return null;
  }
}
export function uploadsReady() {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_PUBLIC_BUCKET &&
    publicMediaBase()
  );
}
