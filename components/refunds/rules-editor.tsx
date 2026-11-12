"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  defaultSchedule,
  refundPolicyText,
  rulesFromEditor,
  type Policy,
  type RuleSettings,
} from "@/lib/refunds/rules";

export function RefundRulesEditor({
  settings,
  onChange,
  canAuto,
}: {
  settings: RuleSettings;
  onChange: (settings: RuleSettings) => void;
  canAuto: boolean;
}) {
  const policy = settings.refundPolicy === "72h" ? "full" : settings.refundPolicy;
  const full = policy === "full";
  const schedule = policy === "schedule";
  const rows = full ? settings.refundRules.slice(0, 1) : settings.refundRules;
  let preview = "";
  try {
    const payload = rulesFromEditor(settings);
    preview = refundPolicyText(payload.refund_policy, payload.refund_rules);
  } catch {}
  return (
    <div className="space-y-4">
      <label className="block space-y-2">
        <span className="font-semibold">Refund rules</span>
        <select
          className="block w-full rounded-xl border border-line bg-white p-3"
          value={policy}
          onChange={(event) => {
            const refundPolicy = event.target.value as Policy;
            const refundRules =
              refundPolicy === "full" ? [{ days: "3", percent: "100" }] : defaultSchedule;
            onChange({ ...settings, refundPolicy, refundRules });
          }}
        >
          <option value="none">No refunds</option>
          <option value="full">Full refund until a set time</option>
          <option value="schedule">Refund with a cut as the event gets closer</option>
          <option value="custom">Write my own rules</option>
        </select>
      </label>
      {(full || schedule) &&
        rows.map((row, i) => (
          <div key={i} className="flex flex-wrap items-end gap-3">
            <Input
              label={
                full
                  ? "Full refund if cancelled at least this many days before the event"
                  : `Rule ${i + 1} · Days before the event`
              }
              value={row.days}
              inputMode="decimal"
              onChange={(e) =>
                onChange({
                  ...settings,
                  refundRules: rows.map((r, j) => (j === i ? { ...r, days: e.target.value } : r)),
                })
              }
            />
            {schedule && (
              <Input
                label="Percent back"
                value={row.percent}
                inputMode="numeric"
                onChange={(e) =>
                  onChange({
                    ...settings,
                    refundRules: rows.map((r, j) =>
                      j === i ? { ...r, percent: e.target.value } : r,
                    ),
                  })
                }
              />
            )}
            {schedule && rows.length > 1 && (
              <Button
                type="button"
                onClick={() =>
                  onChange({ ...settings, refundRules: rows.filter((_, j) => j !== i) })
                }
              >
                Remove rule {i + 1}
              </Button>
            )}
          </div>
        ))}
      {(full || schedule) && (
        <p className="text-sm text-muted">
          Use 0.5 for 12 hours. {schedule && "Use 0 days for the rule closest to the start."}
        </p>
      )}
      {schedule && rows.length < 4 && (
        <Button
          type="button"
          onClick={() =>
            onChange({ ...settings, refundRules: [...rows, { days: "", percent: "" }] })
          }
        >
          Add a refund rule
        </Button>
      )}
      {policy === "custom" && (
        <label className="block space-y-2">
          <span className="font-semibold">Your refund rules</span>
          <textarea
            className="block w-full rounded-xl border border-line bg-white p-3"
            rows={4}
            value={settings.refundText}
            maxLength={2000}
            onChange={(event) => onChange({ ...settings, refundText: event.target.value })}
          />
        </label>
      )}
      {(full || schedule) && canAuto && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.refundAutoApprove}
            onChange={(event) => onChange({ ...settings, refundAutoApprove: event.target.checked })}
          />
          Approve refunds automatically when they follow my rules.
        </label>
      )}
      {preview && (
        <p className="rounded-xl bg-soft p-4 text-sm" aria-live="polite">
          {preview}
        </p>
      )}
    </div>
  );
}

export function RefundRulesFormFields({ initial }: { initial: RuleSettings }) {
  const [settings, setSettings] = useState(initial);
  return (
    <>
      <RefundRulesEditor settings={settings} onChange={setSettings} canAuto />
      <input type="hidden" name="refund_settings" value={JSON.stringify(settings)} />
    </>
  );
}
