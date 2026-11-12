"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { shareChannels, shareHref, shareText, type ShareEvent } from "@/lib/sharing/links";
import type { ShareChannel } from "@/lib/db/account-schema";

function log(slug: string, channel: ShareChannel, type: "share" | "visit") {
  void fetch("/api/events/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, channel, type }),
    keepalive: true,
  }).catch(() => {});
}

export function TrackEventReferral({ slug, channel }: { slug: string; channel: ShareChannel }) {
  const last = useRef("");
  useEffect(() => {
    const key = `${slug}/${channel}`;
    if (last.current !== key) {
      last.current = key;
      log(slug, channel, "visit");
    }
  }, [slug, channel]);
  return null;
}

export function ShareButton({ event }: { event: ShareEvent }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState("");
  const [native, setNative] = useState(false);
  const [instagram, setInstagram] = useState(false);

  async function copy(channel: "copy" | "instagram") {
    const url = shareHref(event, channel);
    log(event.slug, channel, "share");
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Link copied.");
    } catch {
      setMessage(url);
    }
  }

  async function shareNative() {
    log(event.slug, "native", "share");
    try {
      await navigator.share({
        title: event.title,
        text: shareText(event, "").trim(),
        url: shareHref(event, "native"),
      });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setMessage("Try copying the link or choose a different app.");
    }
  }

  return (
    <>
      <Button
        className="mt-4"
        onClick={() => {
          setMessage("");
          setInstagram(false);
          setNative(typeof navigator.share === "function");
          dialog.current?.showModal();
        }}
      >
        Share event
      </Button>
      <dialog
        ref={dialog}
        aria-label="Share this event"
        className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-line bg-white p-6 text-ink shadow-xl backdrop:bg-ink/50"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-extrabold">Share this event</h2>
          <form method="dialog">
            <Button type="submit" aria-label="Close share options">
              Close
            </Button>
          </form>
        </div>
        <p className="mt-2 text-sm text-muted">{event.title}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          {(
            [
              "whatsapp",
              "instagram",
              "facebook",
              "x",
              "linkedin",
              "telegram",
              "email",
              "copy",
            ] as const
          ).map((channel) => {
            const label = shareChannels[channel];
            if (channel === "copy")
              return (
                <Button key={channel} onClick={() => copy(channel)}>
                  {label}
                </Button>
              );
            if (channel === "instagram")
              return (
                <Button
                  key={channel}
                  aria-expanded={instagram}
                  onClick={() => setInstagram(!instagram)}
                >
                  {label}
                </Button>
              );
            return (
              <a
                key={channel}
                href={shareHref(event, channel)}
                target={channel === "email" ? undefined : "_blank"}
                rel={channel === "email" ? undefined : "noopener noreferrer"}
                onClick={() => log(event.slug, channel, "share")}
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line px-3 font-semibold hover:bg-soft"
              >
                {label}
              </a>
            );
          })}
          {native && (
            <Button className="col-span-2" onClick={shareNative}>
              Phone share menu
            </Button>
          )}
        </div>
        {instagram && (
          <div className="mt-4 space-y-2 rounded-xl bg-soft p-4">
            <a
              className="block font-semibold text-teal underline"
              href={`/e/${event.slug}/opengraph-image?format=story`}
              download={`${event.slug}-story.png`}
              onClick={() => log(event.slug, "instagram", "share")}
            >
              Download poster for your Story
            </a>
            <Button onClick={() => copy("instagram")}>Copy Instagram link</Button>
          </div>
        )}
        <p role="status" className="mt-3 break-all text-sm text-muted">
          {message}
        </p>
      </dialog>
    </>
  );
}
