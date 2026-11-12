import { formatInr } from "@/lib/format";

export type Rule = { min_hours_before: number; refund_percent: number };
export type RuleInput = { days: string; percent: string };
export type Policy = "72h" | "none" | "full" | "schedule" | "custom";
export type RuleSettings = {
  refundPolicy: Policy;
  refundText: string;
  refundRules: RuleInput[];
  refundAutoApprove: boolean;
};
export const legacyRules: Rule[] = [
  { min_hours_before: 72, refund_percent: 100 },
  { min_hours_before: 0, refund_percent: 0 },
];
export const defaultSchedule: RuleInput[] = [
  { days: "7", percent: "100" },
  { days: "3", percent: "50" },
  { days: "0", percent: "0" },
];

export function rulesFromEditor(settings: RuleSettings) {
  const { refundPolicy, refundRules, refundText, refundAutoApprove } = settings;
  if (refundPolicy === "custom" && refundText.trim().length < 10)
    throw new Error("Describe your refund rules in at least 10 characters.");
  const scheduled = refundPolicy === "full" || refundPolicy === "schedule";
  const input = refundPolicy === "full" ? refundRules.slice(0, 1) : refundRules;
  const rules: Rule[] = refundPolicy === "72h" ? legacyRules : [];
  if (scheduled) {
    if (input.length < 1 || input.length > 4) throw new Error("Use between 1 and 4 refund rules.");
    for (const row of input) {
      const hours = Math.round(Number(row.days) * 24);
      const percent = refundPolicy === "full" ? 100 : Number(row.percent);
      if (
        !/^\d*\.?\d+$/.test(row.days) ||
        Number(row.days) > 365 ||
        Math.abs(Number(row.days) * 24 - hours) > 0.01
      )
        throw new Error("Enter a time from 0 to 365 days, in whole hours. Use 0.5 for 12 hours.");
      if (
        !Number.isInteger(percent) ||
        percent < 0 ||
        percent > 100 ||
        (refundPolicy === "schedule" && !/^\d+$/.test(row.percent))
      )
        throw new Error("Use whole percentages from 0 to 100.");
      rules.push({ min_hours_before: hours, refund_percent: percent });
    }
    if (refundPolicy === "full" && rules[0].min_hours_before > 0)
      rules.push({ min_hours_before: 0, refund_percent: 0 });
    rules.sort((a, b) => b.min_hours_before - a.min_hours_before);
    if (
      rules.some(
        (rule, i) =>
          i > 0 &&
          (rule.min_hours_before === rules[i - 1].min_hours_before ||
            rule.refund_percent > rules[i - 1].refund_percent),
      )
    )
      throw new Error(
        "Use different times and keep refunds the same or smaller as the event gets closer.",
      );
  }
  return {
    refund_policy:
      scheduled || refundPolicy === "72h"
        ? "schedule"
        : refundPolicy === "custom"
          ? `custom: ${refundText.trim()}`
          : "none",
    refund_rules: rules,
    refund_auto_approve: (scheduled || refundPolicy === "72h") && refundAutoApprove,
  };
}

export function settingsFromRules(
  policy: string,
  rules: readonly Rule[],
  auto: boolean,
): RuleSettings {
  const sorted = [...(policy === "72h" ? legacyRules : rules)].sort(
    (a, b) => b.min_hours_before - a.min_hours_before,
  );
  const full =
    sorted[0]?.refund_percent === 100 &&
    (sorted.length === 1 ||
      (sorted.length === 2 && sorted[1].min_hours_before === 0 && sorted[1].refund_percent === 0));
  return {
    refundPolicy:
      policy === "schedule" || policy === "72h"
        ? full
          ? "full"
          : "schedule"
        : policy === "none"
          ? "none"
          : "custom",
    refundText:
      policy === "72h" || policy === "schedule" || policy === "none"
        ? ""
        : policy.replace(/^custom: ?/, ""),
    refundRules: sorted.length
      ? (full ? sorted.slice(0, 1) : sorted).map((rule) => ({
          days: String(Number((rule.min_hours_before / 24).toFixed(4))),
          percent: String(rule.refund_percent),
        }))
      : defaultSchedule,
    refundAutoApprove: auto,
  };
}

function duration(hours: number) {
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return [
    days ? `${days} day${days === 1 ? "" : "s"}` : "",
    rest ? `${rest} hour${rest === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function refundPolicyText(policy: string, rules: readonly Rule[] = []) {
  if (policy === "none") return "No refunds for this event.";
  if (policy !== "schedule" && policy !== "72h") return policy.replace(/^custom: ?/, "");
  const sorted = [...(policy === "72h" ? legacyRules : rules)].sort(
    (a, b) => b.min_hours_before - a.min_hours_before,
  );
  if (!sorted.length) return "No refunds for this event.";
  if (sorted.at(-1)!.min_hours_before > 0) sorted.push({ min_hours_before: 0, refund_percent: 0 });
  if (sorted.every((rule) => rule.refund_percent === 0)) return "No refunds for this event.";
  return sorted
    .map((rule, i) => {
      const lower = duration(rule.min_hours_before);
      const upper = i ? duration(sorted[i - 1].min_hours_before) : "";
      const when =
        lower && upper
          ? `Cancel at least ${lower} but less than ${upper} before the event`
          : lower
            ? `Cancel at least ${lower} before the event`
            : upper
              ? `Cancel less than ${upper} before the event`
              : "Cancel before the event";
      return `${when}: ${rule.refund_percent ? `${rule.refund_percent}% back` : "no refund"}.`;
    })
    .join(" ");
}

export function cancellationMessage(input: {
  hours: number;
  percent: number | null;
  amount: number;
  remaining: number;
  automatic?: boolean;
}) {
  const review = input.automatic
    ? "This request follows the organiser’s rules and will be approved automatically."
    : "The organiser or Tikatero will review your request, usually within 2 working days.";
  if (input.percent === null)
    return `The organiser will choose your refund amount, up to ${formatInr(input.remaining)} incl. GST. ${review}`;
  const time = input.hours > 0 ? `in ${duration(input.hours)}` : "in less than 1 hour";
  return `The event is ${time}, so under the organiser’s rules you’ll get back ${formatInr(input.amount)} of ${formatInr(input.remaining)} (${input.percent}%). ${review}`;
}

export const PAUSE_REQUEST = "Refunds are on hold for this event right now. Your request is saved.";
