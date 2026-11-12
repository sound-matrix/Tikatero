import { describe, expect, it } from "vitest";
import {
  cancellationMessage,
  defaultSchedule,
  refundPolicyText,
  rulesFromEditor,
  type RuleSettings,
} from "./rules";

const settings: RuleSettings = {
  refundPolicy: "schedule",
  refundText: "",
  refundAutoApprove: false,
  refundRules: defaultSchedule,
};

describe("event refund rules", () => {
  it("sorts the schedule and previews the exact boundary and amount for each period", () => {
    const payload = rulesFromEditor({ ...settings, refundRules: [...defaultSchedule].reverse() });
    expect(payload.refund_rules).toEqual([
      { min_hours_before: 168, refund_percent: 100 },
      { min_hours_before: 72, refund_percent: 50 },
      { min_hours_before: 0, refund_percent: 0 },
    ]);
    expect(refundPolicyText(payload.refund_policy, payload.refund_rules)).toBe(
      "Cancel at least 7 days before the event: 100% back. Cancel at least 3 days but less than 7 days before the event: 50% back. Cancel less than 3 days before the event: no refund.",
    );
  });

  it("accepts half days and rejects duplicates, growing percentages, and out-of-range rules", () => {
    const full = rulesFromEditor({
      ...settings,
      refundPolicy: "full",
      refundRules: [{ days: "0.5", percent: "100" }],
    });
    expect(full.refund_rules[0].min_hours_before).toBe(12);
    expect(refundPolicyText(full.refund_policy, full.refund_rules)).toContain("12 hours");
    for (const refundRules of [
      [{ days: "366", percent: "50" }],
      [{ days: "3", percent: "101" }],
      [{ days: "3", percent: "50.5" }],
      [
        { days: "3", percent: "50" },
        { days: "3", percent: "40" },
      ],
      [
        { days: "3", percent: "50" },
        { days: "2", percent: "60" },
      ],
    ])
      expect(() => rulesFromEditor({ ...settings, refundRules })).toThrow();
  });

  it("shows the buyer what their refund is worth in rupees", () => {
    expect(
      cancellationMessage({ hours: 120, percent: 50, amount: 75000, remaining: 150000 }),
    ).toContain("in 5 days, so under the organiser’s rules you’ll get back ₹750 of ₹1,500 (50%)");
    expect(
      cancellationMessage({ hours: 12, percent: 50, amount: 74999, remaining: 149999 }),
    ).toContain("₹749.99 of ₹1,499.99");
  });
});
