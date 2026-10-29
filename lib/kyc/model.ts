export class KycError extends Error {}
export const stepNames = [
  "Organiser details",
  "PAN",
  "Aadhaar",
  "GSTIN (optional)",
  "Bank account",
  "Selfie",
  "Review & submit",
] as const;
export type CheckStep = "pan" | "aadhaar" | "gstin" | "bank" | "selfie";
export type Step = "details" | CheckStep;
export const editableSteps: Step[] = ["details", "pan", "aadhaar", "gstin", "bank", "selfie"];
export type Details = {
  displayName: string;
  legalName: string;
  type: "individual" | "business";
  phone: string;
  city: string;
};
export type Check = {
  completed: boolean;
  passed: boolean;
  mode: "mock" | "cashfree" | "manual";
  ref: string;
  last4?: string;
  name?: string;
  score?: number;
  faceScore?: number;
  ifsc?: string;
  docKey?: string;
  skipped?: boolean;
};
export type Progress = { details?: Details } & Partial<Record<CheckStep, Check>>;
export type Application = {
  id: string;
  organiser_id: string;
  status: string;
  revision: number;
  step_progress: Progress;
  flagged_steps: string[];
  reviewer_note: string | null;
  submission_count: number;
};
export type FlowState = {
  application: Application | null;
  mode: "mock" | "cashfree";
  organiserId: string;
  displayName: string;
  error?: string;
  success?: string;
  redirectUrl?: string;
};

export function maskLast4(value: string): string {
  const clean = value.replace(/[\s-]/g, "");
  if (clean.length < 4 || !/^[a-z0-9]+$/i.test(clean)) throw new KycError("Enter a valid number.");
  return clean.slice(-4).toUpperCase();
}
export function nameMatch(a: string, b: string): number {
  const normalize = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toUpperCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(" ");
  const left = normalize(a),
    right = normalize(b);
  if (!left || !right) return 0;
  const row = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const old = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      previous = old;
    }
  }
  return Math.round(100 * (1 - row[right.length] / Math.max(left.length, right.length)));
}
export function matchThreshold(value?: string): number {
  if (!value?.trim()) return 85;
  const threshold = Number(value);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100)
    throw new KycError("Verification settings need attention. Please contact support.");
  return threshold;
}
export function autoResult(progress: Progress, threshold = 85) {
  const flagged = editableSteps.filter((step) => {
    if (step === "details") return !progress.details;
    const check = progress[step];
    if (!check?.completed || !check.passed) return true;
    if (step === "gstin" && check.skipped) return false;
    if (["pan", "bank"].includes(step))
      return !Number.isFinite(check.score) || check.score! < threshold;
    if (step === "selfie")
      return (
        !Number.isFinite(check.score) ||
        !Number.isFinite(check.faceScore) ||
        check.score! < threshold ||
        check.faceScore! < threshold
      );
    return false;
  });
  return { status: flagged.length ? ("needs_docs" as const) : ("auto_passed" as const), flagged };
}
export function canEdit(application: Application | null, step: Step) {
  if (!application || application.status === "draft") return true;
  return application.status === "needs_docs" && application.flagged_steps.includes(step);
}
export function nextStep(application: Application | null): number {
  if (!application) return 0;
  const progress = application.step_progress;
  if (application.status === "needs_docs") {
    const first = editableSteps.findIndex((step) => application.flagged_steps.includes(step));
    return first < 0 ? 6 : first;
  }
  const first = editableSteps.findIndex((step) =>
    step === "details" ? !progress.details : !progress[step]?.completed,
  );
  return first < 0 ? 6 : first;
}
