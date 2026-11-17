"use client";

import { useState } from "react";

type Props = { slug: string; title: string; date: string; city: string | null; url: string; qr: string };

export function MarketingPoster({ slug, title, date, city, url, qr }: Props) {
  const [notice, setNotice] = useState("");

  async function download() {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1350;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas is unavailable");
      const gradient = ctx.createLinearGradient(0, 0, 1080, 1350);
      gradient.addColorStop(0, "#102a33");
      gradient.addColorStop(1, "#071217");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 1080, 1350);
      ctx.fillStyle = "#5ce0d0";
      ctx.font = "bold 44px sans-serif";
      ctx.fillText("TIKATERO", 80, 115);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 62px sans-serif";
      const words = title.split(/\s+/);
      const lines: string[] = [];
      let line = "";
      for (const word of words) {
        const next = line ? line + " " + word : word;
        if (ctx.measureText(next).width > 900 && line) { lines.push(line); line = word; }
        else line = next;
      }
      if (line) lines.push(line);
      lines.slice(0, 4).forEach((text, index) => ctx.fillText(text, 80, 235 + index * 78));
      ctx.fillStyle = "#bcdfdb";
      ctx.font = "36px sans-serif";
      ctx.fillText(date.slice(0, 55), 80, 625);
      ctx.fillText((city ?? "Book online").slice(0, 45), 80, 682);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(350, 745, 380, 380);
      const image = new Image();
      image.src = qr;
      await new Promise<void>((resolve, reject) => {
        if (image.complete && image.naturalWidth) { resolve(); return; }
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Could not load the QR code"));
      });
      ctx.drawImage(image, 380, 775, 320, 320);
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 40px sans-serif";
      ctx.fillText("SCAN TO BOOK TICKETS", 540, 1200);
      ctx.font = "26px sans-serif";
      ctx.fillStyle = "#bcdfdb";
      ctx.fillText("Powered by Tikatero", 540, 1260);
      const anchor = document.createElement("a");
      anchor.href = canvas.toDataURL("image/png");
      anchor.download = `${slug}-qr-poster.png`;
      anchor.click();
      setNotice("QR poster downloaded.");
    } catch {
      setNotice("Poster generation is unavailable in this browser. Use the QR download instead.");
    }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(url); setNotice("Event link copied."); }
    catch { setNotice("Copy unavailable. Select the link below."); }
  }

  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="text-xl font-bold">Event link & QR poster</h2>
      <p className="mt-2 text-sm text-muted">Share your permanent event link or download a branded poster with a scannable booking QR.</p>
      <label htmlFor="marketing-link" className="mt-4 block text-sm font-semibold">Public event URL</label>
      <input id="marketing-link" readOnly value={url} onFocus={(event) => event.currentTarget.select()} className="mt-2 w-full rounded-lg border border-line bg-soft p-3 text-sm" />
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={copy} className="min-h-11 rounded-xl border border-line px-4 font-bold">Copy event link</button>
        <button type="button" onClick={download} className="min-h-11 rounded-xl bg-teal px-4 font-bold text-white">Download QR poster</button>
        <a href={`https://wa.me/?text=${encodeURIComponent(title + " — Book tickets: " + url)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 font-bold">Share on WhatsApp</a>
      </div>
      <p role="status" aria-live="polite" className="mt-3 text-sm text-teal">{notice}</p>
    </section>
  );
}
