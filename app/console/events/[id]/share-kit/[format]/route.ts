import { requireAccount } from "@/lib/auth/account";
import { allowRequest } from "@/lib/security/rate-limit";
import type { CaptionEvent } from "@/lib/social/caption";
import { renderSocialImage, type SocialImageFormat } from "@/lib/social/render";
import { readStoredSocialImage } from "@/lib/social/store";

const formats = new Set(["square", "story"]);

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; format: string }> },
) {
  const { id, format } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !formats.has(format))
    return new Response(null, { status: 404 });
  const { client, account } = await requireAccount();
  if (!account.organisers.length) return new Response(null, { status: 404 });
  const { data: event, error } = await client
    .from("events")
    .select(
      "id,organiser_id,slug,title,category,starts_at,venue_name,city,poster_key,theme,is_free,status,hidden_at,is_unlisted",
    )
    .eq("id", id)
    .maybeSingle();
  if (
    error ||
    !event ||
    !account.organisers.some((org) => org.id === event.organiser_id) ||
    event.status !== "published" ||
    event.hidden_at ||
    event.is_unlisted
  ) {
    return new Response(null, { status: 404 });
  }
  if (!(await allowRequest("social-kit", account.profile.id, 30, 3600))) {
    return new Response(null, { status: 429 });
  }
  const tiers = await client.from("ticket_types").select("price_paise").eq("event_id", id);
  if (tiers.error) return new Response(null, { status: 503 });
  const prices = (tiers.data ?? []).map((tier) => tier.price_paise);
  const artwork: CaptionEvent = {
    title: event.title,
    slug: event.slug,
    starts_at: event.starts_at ?? new Date().toISOString(),
    venue_name: event.venue_name,
    city: event.city,
    category: event.category,
    poster_key: event.poster_key,
    theme: event.theme,
    is_free: event.is_free,
    min_price_paise: prices.length ? Math.min(...prices) : null,
    tiers: prices.map((price_paise) => ({ price_paise })),
  };
  let bytes: Buffer | null = null;
  try {
    bytes = await readStoredSocialImage(id, format as "square" | "story");
  } catch {
    bytes = null;
  }
  if (!bytes) bytes = await renderSocialImage(artwork, format as SocialImageFormat);
  const preview = new URL(request.url).searchParams.get("preview") === "1";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="${event.slug}-${format}.jpg"`,
      "Cache-Control": "private, no-store",
    },
  });
}
