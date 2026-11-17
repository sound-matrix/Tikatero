import { referralLink } from "@/lib/sharing/links";

export type InstagramPlacement = "story" | "bio" | "ad";
const placements: Record<InstagramPlacement, string> = {
  story: "story",
  bio: "bio",
  ad: "paid_ad",
};

/** URLs remain on Tikatero; Meta decides where clickable stickers/CTAs are allowed. */
export function instagramTicketUrl(origin: string, slug: string, placement: InstagramPlacement) {
  const target = new URL(`/e/${encodeURIComponent(slug)}/book`, origin);
  const url = new URL(referralLink(target.toString(), "instagram"));
  url.searchParams.set("utm_source", "instagram");
  url.searchParams.set("utm_medium", placement === "ad" ? "paid_social" : "organic_social");
  url.searchParams.set("utm_campaign", slug);
  url.searchParams.set("utm_content", placements[placement]);
  return url.toString();
}

export function instagramEventCaption(title: string, city: string | null, url: string) {
  const intro = [title, city].filter(Boolean).join(" · ");
  return `🎟️ ${intro}\nTickets are available on Tikatero!\nBook here: ${url}\n\n#Tikatero #BookTickets #Events`;
}
