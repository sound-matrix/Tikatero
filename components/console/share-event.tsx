import QRCode from "qrcode";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Card } from "@/components/ui/card";
import { ShareButton } from "@/components/discovery/share-button";
import type { Database } from "@/lib/db/types";
import { formatIst } from "@/lib/format";
import { siteOrigin } from "@/lib/discovery/seo";
import { shareChannels } from "@/lib/sharing/links";

type Event = {
  id: string;
  slug: string;
  title: string;
  starts_at: string | null;
  city: string | null;
};

export async function ShareEventCard({
  client,
  event,
}: {
  client: SupabaseClient<Database>;
  event: Event;
}) {
  const url = `${await siteOrigin()}/e/${event.slug}`;
  const [qr, stats] = await Promise.all([
    QRCode.toDataURL(url, { width: 512, margin: 3, errorCorrectionLevel: "M" }),
    client.rpc("event_share_stats", { p_event_id: event.id }),
  ]);
  return (
    <Card>
      <h2 className="text-xl font-bold">Share your event</h2>
      <div className="mt-4 grid gap-6 lg:grid-cols-[12rem_1fr]">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            width={160}
            height={160}
            alt={`QR code for ${event.title}`}
            className="size-40 rounded-xl border border-line"
          />
          <a
            href={qr}
            download={`${event.slug}-qr.png`}
            className="mt-2 inline-block text-sm font-semibold text-teal underline"
          >
            Download QR code
          </a>
          <div>
            <ShareButton
              event={{
                slug: event.slug,
                url,
                title: event.title,
                date: event.starts_at ? formatIst(event.starts_at) : "",
                city: event.city,
              }}
            />
          </div>
        </div>
        {stats.error ? (
          <p className="text-sm text-muted">Share figures are temporarily unavailable.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th scope="col">Channel</th>
                <th scope="col">Shares</th>
                <th scope="col">Visits</th>
                <th scope="col">Bookings</th>
              </tr>
            </thead>
            <tbody>
              {stats.data.map(({ channel, shares, visits, bookings }) => (
                <tr className="border-b border-line" key={channel}>
                  <th scope="row" className="py-2 font-semibold">
                    {shareChannels[channel]}
                  </th>
                  <td>{shares}</td>
                  <td>{visits}</td>
                  <td>{bookings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
