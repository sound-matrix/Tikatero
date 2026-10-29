import { z } from "zod";
import { categories, fromIstInput, toPaise, isGoogleMapsUrl, slugBase, type Values } from "./model";
const text = z.string().trim().max(2000);
const uuid = z.string().uuid();
const guest = z
  .object({
    id: uuid,
    name: text.max(120),
    title: text.max(150),
    photoKey: text.max(300),
    vip: z.boolean(),
  })
  .strict();
const tier = z
  .object({
    id: uuid,
    name: text.max(100),
    price: text.max(30),
    quantity: text.max(12),
    perOrderMax: text.max(12),
    salesStart: text.max(30),
    salesEnd: text.max(30),
    vip: z.boolean(),
  })
  .strict();
export const valuesSchema = z
  .object({
    title: text.max(150),
    category: z.enum(categories),
    description: text.max(10000),
    theme: z.enum(["none", "diwali", "christmas", "new_year"]),
    free: z.boolean(),
    startsAt: text.max(30),
    endsAt: text.max(30),
    gatesAt: text.max(30),
    venue: text.max(150),
    address: text.max(500),
    city: text.max(100),
    country: z.string().regex(/^[A-Z]{2}$/, "Choose a country."),
    mapsUrl: text.max(2000),
    lat: text.max(30),
    lng: text.max(30),
    posterKey: text.max(300),
    guests: z.array(guest).max(20),
    tiers: z.array(tier).max(20),
    feePayer: z.enum(["organiser", "buyer"]),
    refundPolicy: z.enum(["72h", "none", "custom"]),
    refundText: text.max(2000),
  })
  .strict();
export const inputSchema = z
  .object({
    eventId: uuid,
    organiserId: uuid,
    revision: z.number().int().min(0),
    step: z.number().int().min(0).max(7),
    nextStep: z.number().int().min(0).max(7),
    publish: z.boolean(),
    advance: z.boolean(),
    values: valuesSchema,
  })
  .strict();
export type SaveInput = z.infer<typeof inputSchema>;
function requireValue(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
function imageKey(value: string, kind: "poster" | "guest_photo", id: string) {
  requireValue(
    !value || new RegExp(`^${kind}/${id}/[0-9a-f-]{36}\\.(jpg|png|webp)$`, "i").test(value),
    "Please upload an image for this event.",
  );
}
function positive(value: string, label: string) {
  requireValue(
    /^\d+$/.test(value) &&
      Number.isSafeInteger(Number(value)) &&
      Number(value) > 0 &&
      Number(value) <= 1000000,
    `${label} must be a whole number from 1 to 10,00,000.`,
  );
  return Number(value);
}
export function validateStep(v: Values, step: number, eventId: string) {
  switch (step) {
    case 0:
      requireValue(v.title.length >= 3, "Enter an event name with at least 3 characters.");
      requireValue(v.description.length >= 10, "Describe your event in at least 10 characters.");
      break;
    case 1: {
      const start = fromIstInput(v.startsAt),
        end = fromIstInput(v.endsAt),
        gates = fromIstInput(v.gatesAt);
      requireValue(start, "Choose a start date and time.");
      requireValue(!end || end > start, "The event must end after it starts.");
      requireValue(!gates || gates <= start, "Gates must open at or before the event starts.");
      break;
    }
    case 2:
      requireValue(v.venue && v.address && v.city, "Enter a venue name, address and city.");
      requireValue(
        !v.mapsUrl || isGoogleMapsUrl(v.mapsUrl),
        "Paste a valid HTTPS Google Maps link.",
      );
      requireValue(
        (!v.lat && !v.lng) ||
          (v.lat !== "" &&
            v.lng !== "" &&
            Number.isFinite(Number(v.lat)) &&
            Number.isFinite(Number(v.lng)) &&
            Math.abs(Number(v.lat)) <= 90 &&
            Math.abs(Number(v.lng)) <= 180),
        "Choose a valid map pin or leave both coordinates empty.",
      );
      break;
    case 3:
      imageKey(v.posterKey, "poster", eventId);
      break;
    case 4:
      requireValue(
        new Set(v.guests.map((g) => g.id)).size === v.guests.length,
        "Each guest must be unique.",
      );
      for (const g of v.guests) {
        requireValue(
          g.name && g.title,
          "Enter a name and title for every guest, or remove the empty guest.",
        );
        imageKey(g.photoKey, "guest_photo", eventId);
      }
      break;
    case 5:
      requireValue(v.tiers.length, "Add at least one ticket tier or RSVP group.");
      requireValue(
        new Set(v.tiers.map((t) => t.id)).size === v.tiers.length,
        "Each ticket tier must be unique.",
      );
      for (const t of v.tiers) {
        requireValue(t.name, "Give every tier a name.");
        if (!v.free) toPaise(t.price);
        const qty = positive(t.quantity, "Quantity");
        if (t.perOrderMax)
          requireValue(
            positive(t.perOrderMax, "Per-order maximum") <= qty,
            "Per-order maximum cannot exceed quantity.",
          );
        const start = fromIstInput(t.salesStart),
          end = fromIstInput(t.salesEnd),
          eventStart = fromIstInput(v.startsAt);
        requireValue(!start || !end || end > start, "Ticket sales must end after they start.");
        requireValue(
          !eventStart || ((!start || start <= eventStart) && (!end || end <= eventStart)),
          "Ticket sales must end by the event start time.",
        );
      }
      break;
    case 6:
      requireValue(
        v.refundPolicy !== "custom" || v.refundText.length >= 10,
        "Describe your custom refund policy in at least 10 characters.",
      );
      break;
  }
}
export function validatePublish(v: Values, eventId: string) {
  for (let step = 0; step < 7; step++) validateStep(v, step, eventId);
  requireValue(
    Date.parse(fromIstInput(v.startsAt)!) > Date.now(),
    "Choose a start time in the future before publishing.",
  );
}
export function stepPayload(v: Values, step: number) {
  switch (step) {
    case 0:
      return {
        title: v.title,
        category: v.category,
        description: v.description,
        theme: v.theme,
        slug: slugBase(v.title),
        is_free: v.free,
      };
    case 1:
      return {
        starts_at: fromIstInput(v.startsAt),
        ends_at: fromIstInput(v.endsAt),
        gates_open_at: fromIstInput(v.gatesAt),
      };
    case 2:
      return {
        venue_name: v.venue,
        address: v.address,
        city: v.city,
        country: v.country,
        maps_url: v.mapsUrl || null,
        lat: v.lat ? Number(v.lat) : null,
        lng: v.lng ? Number(v.lng) : null,
      };
    case 3:
      return { poster_key: v.posterKey || null };
    case 4:
      return {
        guests: v.guests.map((g, sort) => ({
          id: g.id,
          name: g.name,
          title: g.title,
          photo_key: g.photoKey || null,
          is_vip: g.vip,
          sort,
        })),
      };
    case 5:
      return {
        tiers: v.tiers.map((t, sort) => ({
          id: t.id,
          name: t.name,
          price_paise: v.free || !t.price.trim() ? 0 : toPaise(t.price),
          qty_total: Number(t.quantity),
          per_order_max: t.perOrderMax ? Number(t.perOrderMax) : null,
          sales_start: fromIstInput(t.salesStart),
          sales_end: fromIstInput(t.salesEnd),
          is_vip: t.vip,
          sort,
        })),
      };
    case 6:
      return {
        fee_payer: v.feePayer,
        refund_policy: v.refundPolicy === "custom" ? `custom: ${v.refundText}` : v.refundPolicy,
      };
    default:
      return {};
  }
}
/** Validate optional values too; draft saving relaxes missing required fields only. */
export function validateSavedInput(v: Values, step: number, eventId: string) {
  if (step === 1) {
    fromIstInput(v.startsAt);
    fromIstInput(v.endsAt);
    fromIstInput(v.gatesAt);
  }
  if (step === 2) {
    requireValue(!v.mapsUrl || isGoogleMapsUrl(v.mapsUrl), "Paste a valid HTTPS Google Maps link.");
    requireValue(
      (!v.lat && !v.lng) ||
        (v.lat !== "" &&
          v.lng !== "" &&
          Number.isFinite(Number(v.lat)) &&
          Number.isFinite(Number(v.lng)) &&
          Math.abs(Number(v.lat)) <= 90 &&
          Math.abs(Number(v.lng)) <= 180),
      "Choose a valid map pin or leave both coordinates empty.",
    );
  }
  if (step === 3) imageKey(v.posterKey, "poster", eventId);
  if (step === 4) {
    requireValue(
      new Set(v.guests.map((g) => g.id)).size === v.guests.length,
      "Each guest must be unique.",
    );
    for (const g of v.guests) imageKey(g.photoKey, "guest_photo", eventId);
  }
  if (step === 5) {
    requireValue(
      new Set(v.tiers.map((t) => t.id)).size === v.tiers.length,
      "Each tier must be unique.",
    );
    for (const t of v.tiers) {
      if (t.price && !v.free) toPaise(t.price);
      for (const number of [t.quantity, t.perOrderMax])
        requireValue(
          !number || (/^\d+$/.test(number) && Number(number) <= 1000000),
          "Use a whole quantity up to 10,00,000.",
        );
      fromIstInput(t.salesStart);
      fromIstInput(t.salesEnd);
    }
  }
}
