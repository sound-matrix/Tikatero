"use client";

import { useEffect, useState } from "react";
import { SalesFigures } from "./sales-view";
import type { EventSales } from "@/lib/payouts/read";

export function LiveSalesFigures({
  initial,
  staff = false,
}: {
  initial: EventSales;
  staff?: boolean;
}) {
  const [event, setEvent] = useState(initial);
  const [seconds, setSeconds] = useState(0);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    let updatedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let highlight: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;
    let active = true;
    let prior = JSON.stringify(initial.live);
    const visible = () => document.visibilityState === "visible";
    const schedule = () => {
      clearTimeout(timer);
      if (active && visible()) timer = setTimeout(refresh, 15000);
    };
    async function refresh() {
      if (!active || !visible() || request) return;
      request = new AbortController();
      try {
        const response = await fetch(`/${staff ? "admin" : "console"}/events/${initial.id}/live`, {
          cache: "no-store",
          signal: request.signal,
        });
        if (!response.ok) return;
        const next = (await response.json()) as EventSales;
        if (!active) return;
        const current = JSON.stringify(next.live);
        if (current !== prior) {
          prior = current;
          setChanged(true);
          clearTimeout(highlight);
          highlight = setTimeout(() => setChanged(false), 1000);
        }
        setEvent(next);
        updatedAt = Date.now();
        setSeconds(0);
      } catch {
        // Keep the last successful response and retry on the next tick.
      } finally {
        request = undefined;
        schedule();
      }
    }
    function visibilityChanged() {
      clearTimeout(timer);
      if (visible()) void refresh();
      else request?.abort();
    }
    const clock = setInterval(() => {
      if (visible()) setSeconds(Math.floor((Date.now() - updatedAt) / 1000));
    }, 1000);
    schedule();
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("focus", visibilityChanged);
    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(highlight);
      clearInterval(clock);
      request?.abort();
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("focus", visibilityChanged);
    };
  }, [initial, staff]);
  return (
    <>
      <p className="text-sm text-muted">
        {seconds < 2 ? "Updated just now" : `Updated ${seconds} s ago`}
      </p>
      <SalesFigures event={event} detail staff={staff} changed={changed} />
    </>
  );
}
