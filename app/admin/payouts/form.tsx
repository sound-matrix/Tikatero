"use client";

import { useActionState, useState, type ReactNode } from "react";
import { payoutAction } from "./actions";

export function PayoutForm({ children, className }: { children: ReactNode; className?: string }) {
  const [state, action, pending] = useActionState(payoutAction, {});
  return (
    <form action={action} className={className}>
      <fieldset disabled={pending} className="space-y-3">
        {children}
      </fieldset>
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="mt-2 text-sm text-teal">
          {state.success}
        </p>
      )}
    </form>
  );
}

function BankRequest({ host, test, reset }: { host: string; test: boolean; reset: () => void }) {
  const [state, action, pending] = useActionState(payoutAction, {});
  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="operation" value="show" />
      <input type="hidden" name="host" value={host} />
      <input type="hidden" name="test" value={String(test)} />
      {state.bankNumber ? (
        <>
          <output className="font-mono">{state.bankNumber}</output>{" "}
          <button type="button" className="underline" onClick={reset}>
            Hide
          </button>
        </>
      ) : (
        <button type="submit" disabled={pending} className="underline">
          Show account number
        </button>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function RevealBank({ host, test }: { host: string; test: boolean }) {
  const [version, setVersion] = useState(0);
  return (
    <BankRequest
      key={version}
      host={host}
      test={test}
      reset={() => setVersion((value) => value + 1)}
    />
  );
}
