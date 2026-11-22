import "server-only";
import { headers } from "next/headers";
import type { PublicEvent } from "./data";
import { buildEventJsonLd } from "./event-schema";
import { mediaUrl } from "@/components/discovery/media";
export async function siteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    try {
      const u = new URL(configured);
      if (["http:", "https:"].includes(u.protocol)) return u.origin;
    } catch {}
  }
  const h = await headers(),
    host = h.get("host") ?? "localhost:3000";
  const protocol = h.get("x-forwarded-proto") === "https" ? "https" : "http";
  return new URL(`${protocol}://${host}`).origin;
}
export function eventJsonLd(e: PublicEvent, origin: string, now: number) {
  return buildEventJsonLd(e, origin, now, mediaUrl(e.poster_key));
}
