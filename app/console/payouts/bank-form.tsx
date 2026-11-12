"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { reverifyPayoutBank } from "./bank-action";

export function PayoutBankForm({ hosts }: { hosts: { id: string; title: string }[] }) {
  const [state, action, pending] = useActionState(reverifyPayoutBank, {});
  const input = "block rounded-lg border border-line px-3 py-2";
  return (
    <details>
      <summary className="cursor-pointer font-semibold">
        Confirm your bank account for payments
      </summary>
      <form action={action} className="mt-3 max-w-md">
        <fieldset disabled={pending} className="space-y-3">
          <p>Enter the same account you used when you verified your identity.</p>
          <label>
            Host
            <select name="host" className={input}>
              {hosts.map((host) => (
                <option key={host.id} value={host.id}>
                  {host.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Account number
            <input
              name="number"
              className={input}
              inputMode="numeric"
              autoComplete="off"
              required
            />
          </label>
          <label>
            IFSC
            <input name="ifsc" className={input} autoComplete="off" maxLength={11} required />
          </label>
          <Button type="submit">Confirm bank account</Button>
        </fieldset>
        {state.success && (
          <p role="status" className="mt-2 text-teal">
            {state.success}
          </p>
        )}
        {state.error && (
          <p role="alert" className="mt-2 text-danger">
            {state.error}
          </p>
        )}
      </form>
    </details>
  );
}
