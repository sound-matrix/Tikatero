"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatIst } from "@/lib/format";
import { DEVICE_ID } from "@/lib/scan/codes";
import {
  judgeOfflineScan,
  packIsLive,
  type OfflinePackView,
  type QueuedScan,
} from "@/lib/scan/offline";
import { loadOfflinePack, loadScanCount, redeemQueued } from "./actions";

type ResultCard = { result: string; holderName?: string | null; tier?: string | null };

function deviceId() {
  const key = "tikatero-scan-device";
  const existing = localStorage.getItem(key);
  if (existing && DEVICE_ID.test(existing)) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}

function readJson<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function tone(result: string) {
  if (result === "Valid") return "border-success bg-success-soft text-success";
  if (result === "Test ticket") return "border-gold bg-gold-soft text-gold-ink";
  return "border-danger bg-danger-soft text-danger";
}

function headline(result: string) {
  if (result === "Valid") return "Valid — let them in";
  if (result === "Test ticket") return "Test ticket — do not admit";
  return result;
}

export function Scanner({
  eventId,
  checkedIn,
  total,
}: {
  eventId: string;
  checkedIn: number;
  total: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const seenRef = useRef<{ raw: string; at: number }>({ raw: "", at: 0 });
  const [count, setCount] = useState({ checkedIn, total });
  const [result, setResult] = useState<ResultCard | null>(null);
  const [notice, setNotice] = useState("");
  const [offline, setOffline] = useState(false);
  const [packNote, setPackNote] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const packRef = useRef<OfflinePackView | null>(null);
  const queueRef = useRef<QueuedScan[]>([]);
  const deviceRef = useRef("");

  function remember(pack: OfflinePackView | null, queue: QueuedScan[]) {
    packRef.current = pack;
    queueRef.current = queue;
    if (pack) localStorage.setItem(`tikatero-scan-pack:${eventId}`, JSON.stringify(pack));
    localStorage.setItem(`tikatero-scan-queue:${eventId}`, JSON.stringify(queue));
  }

  async function sync(queue: QueuedScan[], quiet = false) {
    const pending = queue.filter((item) => item.raw);
    if (!pending.length || !navigator.onLine) return queue;
    const response = await redeemQueued({
      eventId,
      deviceId: deviceRef.current,
      scans: pending.map((item) => ({ id: item.id, raw: item.raw, scannedAt: item.scannedAt })),
    });
    if (response.error || !response.results) {
      if (!quiet)
        setNotice(response.error ?? "Saved on this phone. We'll sync when you're back online.");
      return queue;
    }
    const byId = new Map(response.results.map((item) => [item.id, item]));
    const latest = response.results.at(-1);
    if (!quiet) {
      if (latest?.result)
        setResult({
          result: latest.result,
          holderName: latest.holderName,
          tier: latest.tier,
        });
      setNotice(latest?.error ?? "");
    }
    return queue.flatMap((item) => {
      const synced = byId.get(item.id);
      if (!synced) return [item];
      return synced.result ? [] : [item];
    });
  }

  async function scan(raw: string, scannedAt = new Date().toISOString(), manual = false) {
    const now = Date.now();
    if (!manual && seenRef.current.raw === raw && now - seenRef.current.at < 2500) return;
    seenRef.current = { raw, at: now };
    setBusy(true);
    try {
      if (navigator.onLine) {
        try {
          const queue = await sync([
            ...queueRef.current,
            {
              id: crypto.randomUUID(),
              raw,
              code: raw,
              scannedAt,
              result: "Valid",
              holderName: null,
              tier: null,
            },
          ]);
          remember(packRef.current, queue);
          const counts = await loadScanCount(eventId);
          if (typeof counts.checkedIn === "number" && typeof counts.total === "number")
            setCount({ checkedIn: counts.checkedIn, total: counts.total });
          return;
        } catch {
          setOffline(true);
        }
      }
      const judged = await judgeOfflineScan({
        raw,
        scannedAt,
        pack: packRef.current,
        queued: queueRef.current,
        now,
      });
      remember(packRef.current, judged.queued);
      if (judged.error) setNotice(judged.error);
      else {
        if (judged.result)
          setResult({ result: judged.result, holderName: judged.holderName, tier: judged.tier });
        setNotice("Saved on this phone. It will sync when you're back online.");
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    deviceRef.current = deviceId();
    const storedPack = readJson<OfflinePackView>(`tikatero-scan-pack:${eventId}`);
    const storedQueue = readJson<QueuedScan[]>(`tikatero-scan-queue:${eventId}`) ?? [];
    packRef.current = storedPack && storedPack.eventId === eventId ? storedPack : null;
    queueRef.current = storedQueue;
    const onStatus = () => setOffline(!navigator.onLine);
    onStatus();
    window.addEventListener("online", onStatus);
    window.addEventListener("offline", onStatus);
    navigator.serviceWorker?.register("/scan-sw.js").catch(() => undefined);
    let cancel = false;
    (async () => {
      if (!navigator.onLine) {
        if (packRef.current && packIsLive(packRef.current.expiresAt))
          setPackNote(`Offline check-in is ready until ${formatIst(packRef.current.expiresAt)}.`);
        return;
      }
      const issued = await loadOfflinePack(eventId, deviceRef.current);
      if (cancel) return;
      if (issued.pack) {
        remember(issued.pack, queueRef.current);
        setPackNote("This phone can check tickets in offline for the next 12 hours.");
      } else if (issued.error) setPackNote(issued.error);
      const flushed = await sync(queueRef.current, true);
      if (!cancel) remember(packRef.current, flushed);
    })().catch(() => undefined);
    const timer = window.setInterval(() => {
      if (!navigator.onLine) return;
      loadScanCount(eventId)
        .then((counts) => {
          if (typeof counts.checkedIn === "number" && typeof counts.total === "number")
            setCount({ checkedIn: counts.checkedIn, total: counts.total });
        })
        .catch(() => undefined);
    }, 8000);
    return () => {
      cancel = true;
      window.removeEventListener("online", onStatus);
      window.removeEventListener("offline", onStatus);
      window.clearInterval(timer);
      controlsRef.current?.stop();
    };
    // The scanner is tied to one event for the lifetime of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function startCamera() {
    const video = videoRef.current;
    if (!video) return;
    setNotice("");
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      controlsRef.current?.stop();
      const reader = new BrowserMultiFormatReader();
      controlsRef.current = await reader.decodeFromVideoDevice(undefined, video, (found) => {
        const text = found?.getText();
        if (text) void scan(text);
      });
      setCameraOn(true);
    } catch {
      setCameraOn(false);
      setNotice("The camera isn't available. Type the ticket code instead.");
    }
  }

  function stopCamera() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraOn(false);
  }

  function onManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = code.trim();
    if (!value) return;
    void scan(value, new Date().toISOString(), true);
    setCode("");
  }

  return (
    <div className="space-y-4">
      {offline && (
        <p className="rounded-xl bg-gold-soft px-4 py-3 text-sm font-semibold text-gold-ink">
          You’re offline. Scans stay on this phone and sync when you reconnect.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-line bg-white p-4">
          <p className="text-sm text-muted">Checked in</p>
          <p className="text-4xl font-extrabold text-teal">{count.checkedIn}</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-4">
          <p className="text-sm text-muted">Real tickets</p>
          <p className="text-4xl font-extrabold text-ink">{count.total}</p>
        </div>
      </div>
      {result && (
        <div role="status" className={`rounded-2xl border-2 px-4 py-5 ${tone(result.result)}`}>
          <p className="text-3xl font-extrabold leading-tight">{headline(result.result)}</p>
          {(result.holderName || result.tier) && (
            <p className="mt-2 text-lg font-semibold">
              {[result.holderName, result.tier].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl bg-ink text-white">
        <div className="relative flex aspect-square items-center justify-center">
          <video
            ref={videoRef}
            className={`absolute inset-0 h-full w-full object-cover ${cameraOn ? "" : "hidden"}`}
            muted
            playsInline
            aria-label="Ticket camera"
          />
          <div className="pointer-events-none absolute inset-8 rounded-2xl border-4 border-white" />
          <p className="relative px-6 text-center text-sm">
            {cameraOn ? "Point the camera at the ticket QR" : "Camera is off"}
          </p>
        </div>
      </div>
      {cameraOn ? (
        <Button type="button" className="w-full" onClick={stopCamera}>
          Stop camera
        </Button>
      ) : (
        <Button
          type="button"
          variant="primary"
          className="w-full"
          onClick={() => void startCamera()}
        >
          Start camera
        </Button>
      )}
      <form onSubmit={onManual} className="space-y-3 rounded-2xl border border-line bg-white p-4">
        <Input
          label="Ticket code"
          name="code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="TK-XXXXX-NN"
          maxLength={80}
        />
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? "Checking…" : "Check this code"}
        </Button>
      </form>
      {notice && <p className="text-sm font-semibold text-ink">{notice}</p>}
      {packNote && <p className="text-sm text-muted">{packNote}</p>}
    </div>
  );
}
