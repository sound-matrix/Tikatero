"use client";

import { useState } from "react";
import { instagramTicketUrl, instagramEventCaption, type InstagramPlacement } from "@/lib/sharing/instagram";

type Props = {
  origin: string;
  slug: string;
  title: string;
  city: string | null;
};

const types: { key: InstagramPlacement; title: string; help: string }[] = [
  { key: "story", title: "Instagram Story", help: "Add this link as a Story link sticker; label it Book Tickets." },
  { key: "bio", title: "Instagram Bio", help: "Paste this link into your Instagram profile's Links section." },
  { key: "ad", title: "Sponsored Post or Reel", help: "In Meta Ads Manager, select an available booking CTA and use this website URL." },
];

export function InstagramTicketSalesClient({ origin, slug, title, city }: Props) {
  const [notice, setNotice] = useState("");
  const first = instagramTicketUrl(origin, slug, "story");

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${label} copied.`);
    } catch {
      setNotice("Copy is unavailable in this browser. Select and copy the link manually.");
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Turn Instagram views into ticket buyers. These links open Tikatero's mobile-friendly
        checkout directly—no Instagram login or Meta approval required.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {types.map(({ key, title: name, help }) => {
          const url = instagramTicketUrl(origin, slug, key);
          return (
            <div key={key} className="flex min-w-0 flex-col rounded-2xl border border-line p-4">
              <h3 className="font-bold">{name}</h3>
              <p className="mt-2 flex-1 text-sm text-muted">{help}</p>
              <label className="mt-4 block text-xs font-semibold" htmlFor={`ig-url-${key}`}>
                Your ticket checkout URL
              </label>
              <input id={`ig-url-${key}`} value={url} readOnly onFocus={(e) => e.currentTarget.select()}
                className="mt-2 w-full min-w-0 rounded-lg border border-line bg-soft px-3 py-2 text-xs" />
              <button type="button" onClick={() => copy(url, name)}
                className="mt-3 min-h-11 rounded-xl bg-teal px-3 py-2 text-sm font-bold text-white">
                Copy booking link
              </button>
            </div>
          );
        })}
      </div>
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-line p-4">
          <h3 className="font-bold">Ready-to-share artwork</h3>
          <p className="mt-1 text-sm text-muted">Download an event graphic, then upload it to Instagram.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/e/${slug}/opengraph-image?format=story`} alt={`Instagram Story artwork for ${title}`}
                className="aspect-[9/16] w-full rounded-lg border border-line object-cover" loading="lazy" />
              <a href={`/e/${slug}/opengraph-image?format=story`} download={`${slug}-story.png`}
                className="mt-2 inline-block text-sm font-semibold text-teal underline">Download Story</a>
            </div>
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/e/${slug}/opengraph-image?format=post`} alt={`Square Instagram post artwork for ${title}`}
                className="aspect-square w-full rounded-lg border border-line object-cover" loading="lazy" />
              <a href={`/e/${slug}/opengraph-image?format=post`} download={`${slug}-post.png`}
                className="mt-2 inline-block text-sm font-semibold text-teal underline">Download Post</a>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-line p-4">
          <h3 className="font-bold">Instagram caption</h3>
          <p className="mt-1 text-sm text-muted">Use this caption with your Reel or regular post. Instagram captions aren't clickable; direct people to your bio or Story link.</p>
          <textarea readOnly aria-label="Suggested Instagram caption"
            value={instagramEventCaption(title, city, first)}
            className="mt-4 min-h-40 w-full rounded-xl border border-line bg-soft p-3 text-sm" />
          <button type="button" onClick={() => copy(instagramEventCaption(title, city, first), "Caption")}
            className="mt-3 min-h-11 rounded-xl border border-line px-4 py-2 text-sm font-bold">
            Copy caption
          </button>
          <p className="mt-4 text-sm text-muted">
            For a native button under an Instagram ad, use Meta Ads Manager.
            Tikatero can't add buttons to ordinary organic posts.
          </p>
          <a href="https://adsmanager.facebook.com/" target="_blank" rel="noopener noreferrer"
            className="mt-3 inline-block text-sm font-bold text-teal underline">Open Meta Ads Manager</a>
        </div>
      </div>
      <p role="status" aria-live="polite" className="text-sm font-semibold text-teal">{notice}</p>
    </div>
  );
}
