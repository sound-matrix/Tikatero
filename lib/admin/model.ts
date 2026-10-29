import type { Json } from "@/lib/db/types";
export const waitingStatuses = ["auto_passed", "needs_docs", "submitted"] as const;
export const stepLabels = {
  details: "Organiser details",
  pan: "PAN",
  aadhaar: "Aadhaar",
  gstin: "GSTIN",
  bank: "Bank account",
  selfie: "Selfie",
} as const;
export const statusLabels: Record<string, string> = {
  auto_passed: "Checks passed · awaiting review",
  needs_docs: "More documents needed",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  draft: "Draft",
};
export const fieldClass = "min-h-12 w-full rounded-xl border border-line bg-white px-3 text-ink";
export function object(value: Json | undefined): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
export function checks(value: Json) {
  const progress = object(value);
  return Object.entries(stepLabels)
    .filter(([key]) => key !== "details")
    .map(([key, label]) => {
      const c = object(progress[key]);
      const score = (v: Json | undefined) =>
        typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null;
      return {
        key,
        label,
        completed: c.completed === true,
        passed: c.passed === true,
        skipped: c.skipped === true,
        simulated: c.mode === "mock",
        last4: typeof c.last4 === "string" ? c.last4.slice(-4) : null,
        name: typeof c.name === "string" ? c.name : null,
        score: score(c.score),
        faceScore: score(c.faceScore),
        docKey: typeof c.docKey === "string" ? c.docKey : null,
      };
    });
}
export function isSimulated(value: Json) {
  return checks(value).some((c) => c.simulated);
}
export function ageLabel(value: string | null, now = Date.now()) {
  if (!value) return "No waiting applications";
  const hours = Math.max(0, Math.floor((now - new Date(value).getTime()) / 3600000));
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
export function istDayRange(date = new Date()) {
  const day = new Date(date.getTime() + 330 * 60000).toISOString().slice(0, 10);
  return {
    start: new Date(`${day}T00:00:00+05:30`).toISOString(),
    end: new Date(new Date(`${day}T00:00:00+05:30`).getTime() + 86400000).toISOString(),
  };
}
export function pageNumber(value?: string) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, 4000) : 1;
}
export function uuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
