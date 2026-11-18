import { publicPrice } from "@/lib/discovery/model";
import { formatIst } from "@/lib/format";
import { facebookTicketUrl } from "@/lib/sharing/instagram";

export type SocialKind = "feed" | "story" | "last_seats";
export type SocialPlatform = "instagram" | "facebook";

export type CaptionEvent = {
  title: string;
  slug: string;
  starts_at: string;
  venue_name: string | null;
  city: string | null;
  category: string | null;
  poster_key?: string | null;
  theme?: string | null;
  is_free: boolean;
  min_price_paise: number | null;
  tiers?: { price_paise: number }[];
};

/** Same cases the SQL function social_private.is_test_event uses. */
export const testEventFixtures: {
  title: string;
  slug: string;
  is_test: boolean | null;
  expected: boolean;
}[] = [
  { title: "TEST EVENT", slug: "music-night", is_test: null, expected: true },
  { title: "Music Night", slug: "test-night", is_test: null, expected: true },
  { title: "Music Night", slug: "Test-Gala", is_test: null, expected: true },
  { title: "Music Night", slug: "test", is_test: null, expected: true },
  { title: "Music Night", slug: "TEST", is_test: null, expected: true },
  {
    title: "India vs Australia Test match",
    slug: "india-australia",
    is_test: null,
    expected: true,
  },
  {
    title: "India vs Australia Test match",
    slug: "india-australia",
    is_test: false,
    expected: false,
  },
  {
    title: "India vs Australia Test match",
    slug: "india-australia",
    is_test: true,
    expected: true,
  },
  { title: "Latest comedy", slug: "latest-comedy", is_test: null, expected: false },
  { title: "Contest final", slug: "contest-final", is_test: null, expected: false },
  { title: "A real show", slug: "city-lights", is_test: null, expected: false },
  { title: "Greatest hits", slug: "greatest-hits", is_test: null, expected: false },
];

export function isTestEvent(input: { title: string; slug: string; is_test: boolean | null }) {
  if (input.is_test !== null && input.is_test !== undefined) return input.is_test;
  const slug = input.slug.toLowerCase();
  return /\btest\b/i.test(input.title) || slug.startsWith("test-") || slug === "test";
}

const controlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function stripControls(value: string) {
  return value.replace(controlCharacters, "");
}

export function socialPriceLabel(
  event: Pick<CaptionEvent, "is_free" | "min_price_paise" | "tiers">,
) {
  if (event.is_free) return publicPrice(null, true);
  if (event.min_price_paise === null) return publicPrice(null);
  const prices = new Set((event.tiers ?? []).map((tier) => tier.price_paise));
  const label = publicPrice(event.min_price_paise);
  return prices.size > 1 ? `From ${label}` : label;
}

function hostText(value: string | null | undefined, max: number) {
  return stripControls(value ?? "")
    .replace(/[@#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function hashtag(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function categoryTag(category: string | null) {
  const cleaned = hashtag(category ?? "");
  if (!cleaned) return "";
  if (cleaned === "comedy") return "comedyshow";
  if (cleaned === "festivalparty") return "festival";
  if (cleaned === "weddingprivate") return "wedding";
  if (cleaned === "other") return "events";
  return cleaned;
}

export function socialHashtags(city: string | null, category: string | null) {
  const place = hashtag(city ?? "");
  const tags = [place ? `${place}events` : "", place, categoryTag(category), "tikatero"].filter(
    Boolean,
  );
  return [...new Set(tags)].slice(0, 8);
}

function dropExtra(text: string, pattern: RegExp, max: number) {
  let seen = 0;
  return text.replace(pattern, (match) => {
    seen += 1;
    return seen <= max ? match : "";
  });
}

/** Enforces the caption limits shared with the admin caption editor. */
export function finalizeCaption(text: string) {
  let value = stripControls(text).replace(/\r\n/g, "\n").trim();
  value = dropExtra(value, /@[A-Za-z0-9._]+/g, 20);
  value = dropExtra(value, /#[A-Za-z0-9_]+/g, 30);
  value = value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (value.length > 2200) value = value.slice(0, 2200).trimEnd();
  return value;
}

export function captionMentionsAllowed(caption: string, collaborator: string | null) {
  const allowed = new Set(["tikatero_official"]);
  if (collaborator) allowed.add(collaborator.replace(/^@/, "").toLowerCase());
  const mentions = [...caption.matchAll(/@([A-Za-z0-9._]+)/g)].map((match) =>
    match[1].toLowerCase(),
  );
  const hashtags = caption.match(/#[A-Za-z0-9_]+/g) ?? [];
  return (
    mentions.length <= 20 && hashtags.length <= 30 && mentions.every((name) => allowed.has(name))
  );
}

export function buildSocialCaption(input: {
  platform: SocialPlatform;
  kind: SocialKind;
  event: CaptionEvent;
  origin: string;
}) {
  const title = hostText(input.event.title, 100);
  const venue = hostText(input.event.venue_name, 120);
  const city = hostText(input.event.city, 80);
  const place = [venue, city].filter(Boolean).join(", ");
  const lines: string[] = [];
  if (input.kind === "last_seats") lines.push("⚡ Last few seats left!");
  lines.push(`🎟️ ${title}`);
  lines.push(`📅 ${formatIst(input.event.starts_at)}`);
  if (place) lines.push(`📍 ${place}`);
  lines.push(`💰 ${socialPriceLabel(input.event)}`);
  const host = new URL(input.origin).host;
  lines.push(`Book: ${host}/e/${input.event.slug}`);
  if (input.platform === "instagram") lines.push("🔗 Link in bio: @tikatero_official");
  if (input.platform === "facebook") {
    lines.push(`Book here: ${facebookTicketUrl(input.origin, input.event.slug)}`);
  }
  const tags = socialHashtags(input.event.city, input.event.category);
  if (tags.length) lines.push(tags.map((tag) => `#${tag}`).join(" "));
  return finalizeCaption(lines.filter(Boolean).join("\n"));
}
