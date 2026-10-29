"use client";
import { useEffect, useRef, useState } from "react";
import Script from "next/script";
declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: { sitekey: string; action: string; size: string },
      ) => string;
      remove: (id: string) => void;
    };
  }
}
export function Turnstile({ siteKey, generation }: { siteKey: string; generation: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!ready || !ref.current || !window.turnstile) return;
    const widget = window.turnstile.render(ref.current, {
      sitekey: siteKey,
      action: "checkout",
      size: "flexible",
    });
    return () => window.turnstile?.remove(widget);
  }, [ready, siteKey, generation]);
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        onReady={() => setReady(true)}
      />
      <div ref={ref} className="mt-4" />
    </>
  );
}
