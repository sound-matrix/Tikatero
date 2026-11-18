import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/db/types";
import {
  buildSocialCaption,
  captionMentionsAllowed,
  isTestEvent,
  type CaptionEvent,
  type SocialKind,
  type SocialPlatform,
} from "@/lib/social/caption";
import { metaConfigured, publishToMeta, readMetaConfig } from "@/lib/social/meta";
import { renderSocialImage, type SocialImageFormat } from "@/lib/social/render";
import { socialImageUrl, storeSocialImage } from "@/lib/social/store";
import { insidePostWindow, nextWindowStart } from "@/lib/social/window";
import { createServiceClient } from "@/lib/supabase/service";

type Client = SupabaseClient<Database>;
type PostRow = Database["public"]["Tables"]["social_posts"]["Row"];
type LiveEvent = CaptionEvent & { id: string; starts_at: string };

const kindOrder: Record<string, number> = { feed: 0, story: 1, last_seats: 2 };

export function sortSocialPosts<T extends { event_id: string; platform: string; kind: string }>(
  rows: T[],
) {
  return [...rows].sort((a, b) => {
    if (a.event_id !== b.event_id) return a.event_id < b.event_id ? -1 : 1;
    const aInstagram = a.platform === "instagram" ? 0 : 1;
    const bInstagram = b.platform === "instagram" ? 0 : 1;
    if (aInstagram !== bInstagram) return aInstagram - bInstagram;
    return (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9);
  });
}

export function httpsSiteOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function imageFormat(kind: string): SocialImageFormat {
  if (kind === "story") return "story";
  if (kind === "last_seats") return "last_seats";
  return "square";
}

function asEvent(value: Json): LiveEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, Json | undefined>;
  if (typeof row.id !== "string" || typeof row.slug !== "string" || typeof row.title !== "string")
    return null;
  if (typeof row.starts_at !== "string") return null;
  const tiers = Array.isArray(row.tiers)
    ? row.tiers.flatMap((tier) => {
        if (!tier || typeof tier !== "object" || Array.isArray(tier)) return [];
        const price = (tier as { price_paise?: Json }).price_paise;
        return typeof price === "number" ? [{ price_paise: price }] : [];
      })
    : [];
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    starts_at: row.starts_at,
    venue_name: typeof row.venue_name === "string" ? row.venue_name : null,
    city: typeof row.city === "string" ? row.city : null,
    category: typeof row.category === "string" ? row.category : null,
    poster_key: typeof row.poster_key === "string" ? row.poster_key : null,
    theme: typeof row.theme === "string" ? row.theme : null,
    is_free: row.is_free === true,
    min_price_paise: typeof row.min_price_paise === "number" ? row.min_price_paise : null,
    tiers,
  };
}

async function finish(
  client: Client,
  id: string,
  status: PostRow["status"],
  fields: Record<string, Json>,
) {
  const { error } = await client.rpc("social_finish", {
    p_id: id,
    p_status: status,
    p_fields: fields,
  });
  if (error) throw error;
}

export async function runSocialCron(options?: { budgetMs?: number; now?: Date }) {
  if (!metaConfigured()) return { configured: false as const };
  const origin = httpsSiteOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  const idle = {
    configured: true as const,
    enqueued: 0,
    claimed: 0,
    posted: 0,
    failed: 0,
    skipped: 0,
    waiting: 0,
  };
  if (!origin) return idle;
  const client = createServiceClient();
  const enqueued = await client.rpc("social_enqueue_due", { p_limit: 20 });
  if (enqueued.error) throw enqueued.error;
  const claimed = await client.rpc("social_claim_due", { p_limit: 6 });
  if (claimed.error) throw claimed.error;
  const rows = sortSocialPosts(claimed.data ?? []);
  const counts = { posted: 0, failed: 0, skipped: 0, waiting: 0 };
  const started = Date.now();
  const budget = options?.budgetMs ?? 240_000;
  const now = options?.now ?? new Date();
  for (const row of rows) {
    if (Date.now() - started > budget) break;
    counts[await processPost(client, row, origin, now)] += 1;
  }
  return {
    configured: true as const,
    enqueued: enqueued.data ?? 0,
    claimed: rows.length,
    ...counts,
  };
}

async function processPost(client: Client, row: PostRow, origin: string, now: Date) {
  const [settings, live, social] = await Promise.all([
    client.from("platform_social_settings").select("*").eq("id", true).single(),
    client.rpc("social_live_event", { p_event_id: row.event_id }),
    client.from("event_social_settings").select("*").eq("event_id", row.event_id).maybeSingle(),
  ]);
  if (settings.error || live.error || social.error)
    throw settings.error ?? live.error ?? social.error;
  const event = asEvent(live.data);
  const reason = skipReason(
    settings.data,
    event,
    social.data?.autopost ?? true,
    social.data?.is_test ?? null,
    now,
  );
  if (reason) {
    await finish(client, row.id, "skipped", { skipped_reason: reason });
    return "skipped" as const;
  }
  if (!insidePostWindow(now, settings.data.post_window_start, settings.data.post_window_end)) {
    await finish(client, row.id, "queued", {
      next_attempt_at: nextWindowStart(now, settings.data.post_window_start).toISOString(),
      refund_attempt: true,
    });
    return "waiting" as const;
  }

  const liveEvent = event!;
  let imagePath = row.image_path;
  if (!imagePath) {
    try {
      const bytes = await renderSocialImage(liveEvent, imageFormat(row.kind));
      const stored = await storeSocialImage(row.event_id, imageFormat(row.kind), bytes);
      imagePath = stored.path;
      await finish(client, row.id, "processing", { image_path: imagePath });
    } catch {
      await finish(client, row.id, row.attempts >= 5 ? "failed" : "queued", {
        error: "The picture could not be prepared.",
        ...(row.attempts >= 5
          ? {}
          : { next_attempt_at: new Date(now.getTime() + 10 * 60 * 1000).toISOString() }),
      });
      return row.attempts >= 5 ? ("failed" as const) : ("waiting" as const);
    }
  }
  const imageUrl = socialImageUrl(imagePath);
  if (!imageUrl) {
    await finish(client, row.id, "queued", {
      next_attempt_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      refund_attempt: true,
      error: "The picture link is not secure yet.",
    });
    return "waiting" as const;
  }

  const collaborator =
    row.platform === "instagram" && row.kind === "feed"
      ? (social.data?.ig_collaborator ?? null)
      : null;
  let caption = row.caption;
  if (!caption) {
    caption = buildSocialCaption({
      platform: row.platform,
      kind: row.kind,
      event: liveEvent,
      origin,
    });
    await finish(client, row.id, "processing", { caption });
  }
  if (!captionMentionsAllowed(caption, collaborator)) {
    await finish(client, row.id, "skipped", {
      skipped_reason: "The caption mentions another account.",
    });
    return "skipped" as const;
  }

  const postedCount =
    row.platform === "instagram" ? ((await client.rpc("social_ig_posted_last_24h")).data ?? 0) : 0;
  const outcome = await publishToMeta({
    config: readMetaConfig(),
    post: {
      id: row.id,
      platform: row.platform as SocialPlatform,
      kind: row.kind as SocialKind,
      attempts: row.attempts,
      ig_container_id: row.ig_container_id,
      caption,
      event_slug: liveEvent.slug,
      ig_collaborator: collaborator,
    },
    imageUrl,
    igPostedLast24h: postedCount,
    igDailyCap: settings.data.ig_daily_cap,
    onContainer: async (id) => {
      await finish(client, row.id, "processing", { ig_container_id: id });
    },
  });
  if ("skipped" in outcome) return "waiting" as const;
  if (outcome.action === "posted") {
    await finish(client, row.id, "posted", outcome.fields);
    return "posted" as const;
  }
  if (outcome.action === "failed") {
    await finish(client, row.id, "failed", { error: outcome.error, ...(outcome.fields ?? {}) });
    return "failed" as const;
  }
  await finish(client, row.id, "queued", {
    next_attempt_at: new Date(now.getTime() + outcome.waitMs).toISOString(),
    refund_attempt: outcome.refundAttempt,
    ...(outcome.error ? { error: outcome.error } : {}),
    ...(outcome.fields ?? {}),
  });
  return "waiting" as const;
}

function skipReason(
  settings: { autopost_paused: boolean } | null,
  event: LiveEvent | null,
  autopost: boolean,
  isTest: boolean | null,
  now: Date,
) {
  if (!settings || settings.autopost_paused) return "Posting is paused";
  if (!event) return "Event is hidden now";
  if (!autopost) return "Turned off by admin";
  if (isTestEvent({ title: event.title, slug: event.slug, is_test: isTest }))
    return "This is a test event";
  if (Date.parse(event.starts_at) <= now.getTime() + 3 * 60 * 60 * 1000) return "Event has started";
  return null;
}
