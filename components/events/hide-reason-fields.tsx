"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

export function HideReasonFields({ reasons }: { reasons: readonly string[] }) {
  const [choice, setChoice] = useState("");
  return (
    <>
      <label className="block space-y-1 text-sm font-semibold">
        <span>Reason</span>
        <select
          name="reason"
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
          required
          className="min-h-12 w-full rounded-xl border border-line bg-white px-3"
        >
          <option value="">Choose a reason</option>
          {reasons.map((reason) => (
            <option key={reason}>{reason}</option>
          ))}
        </select>
      </label>
      {choice === "Other" && <Input label="Tell us why" name="note" maxLength={300} required />}
    </>
  );
}
