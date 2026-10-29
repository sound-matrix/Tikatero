import Link from "next/link";
import type { PublicEvent } from "@/lib/discovery/data";
import { publicPrice } from "@/lib/discovery/model";
import { formatIst } from "@/lib/format";
import { EventMedia } from "./media";
export function EventCard({ event: e }: { event: PublicEvent }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-white p-3 transition hover:shadow-md">
      <Link href={`/e/${e.slug}`} className="block rounded-xl">
        <EventMedia title={e.title} posterKey={e.poster_key} theme={e.theme} compact />
        <div className="px-2 pb-2 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            {e.category ?? "Event"} · {e.city ?? e.country}
          </p>
          <h3 className="mt-2 text-xl font-bold leading-snug">{e.title}</h3>
          <p className="mt-2 text-sm text-muted">{formatIst(e.starts_at)}</p>
          <p className="mt-1 text-sm text-muted">{e.venue_name}</p>
          <p className="mt-4 font-bold">
            {e.is_free
              ? publicPrice(null, true)
              : `${e.min_price_paise === null ? "" : "From "}${publicPrice(e.min_price_paise)}`}
          </p>
          <p className="mt-2 text-sm text-muted">
            {e.organiser_name}
            {e.verified && <span className="ml-2 font-semibold text-[#087570]">✓ Verified</span>}
          </p>
        </div>
      </Link>
    </article>
  );
}
