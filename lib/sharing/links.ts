import type { ShareChannel } from "@/lib/db/account-schema";

export const shareChannels = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
  linkedin: "LinkedIn",
  telegram: "Telegram",
  email: "Email",
  copy: "Copy link",
  native: "Phone share menu",
} as const satisfies Record<ShareChannel, string>;

export function shareChannel(value: unknown): ShareChannel | null {
  return typeof value === "string" && Object.hasOwn(shareChannels, value)
    ? (value as ShareChannel)
    : null;
}

export type ShareEvent = {
  slug: string;
  url: string;
  title: string;
  date: string;
  city: string | null;
};

export function referralLink(url: string, channel: ShareChannel) {
  const link = new URL(url);
  link.searchParams.set("ref", channel);
  return link.href;
}

export function shareText(event: ShareEvent, url: string) {
  return (
    [event.title, event.date, event.city].filter(Boolean).join(" · ") + `. Book on Tikatero: ${url}`
  );
}

export function shareHref(event: ShareEvent, channel: ShareChannel) {
  const url = referralLink(event.url, channel);
  const text = shareText(event, url);
  const encode = encodeURIComponent;
  switch (channel) {
    case "whatsapp":
      return `https://wa.me/?text=${encode(text)}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${encode(url)}`;
    case "x":
      return `https://twitter.com/intent/tweet?text=${encode(shareText(event, "").trim())}&url=${encode(url)}`;
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${encode(url)}`;
    case "telegram":
      return `https://t.me/share/url?url=${encode(url)}&text=${encode(shareText(event, "").trim())}`;
    case "email":
      return `mailto:?subject=${encode(event.title.replace(/[\r\n]/g, " "))}&body=${encode(text)}`;
    default:
      return url;
  }
}

export function bookingPath(
  slug: string,
  step: "book" | "checkout",
  tier: string | undefined,
  ref: ShareChannel | null,
) {
  const query = new URLSearchParams();
  if (tier) query.set("tier", tier);
  if (ref) query.set("ref", ref);
  return `/e/${slug}/${step}${query.size ? `?${query}` : ""}`;
}

export function refCookie(slug: string) {
  return `event_ref_${slug}`;
}
