"use client";
import { useState } from "react";
import Script from "next/script";
declare global {
  interface Window {
    Cashfree?: (options: { mode: "sandbox" | "production" }) => {
      checkout: (options: {
        paymentSessionId: string;
        redirectTarget: "_self";
      }) => Promise<unknown>;
    };
  }
}
export function CashfreeCheckout({
  sessionId,
  mode,
}: {
  sessionId: string;
  mode: "sandbox" | "production";
}) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <Script
        src="https://sdk.cashfree.com/js/v3/cashfree.js"
        onReady={() => setReady(true)}
        onError={() => setError("Payment could not load. Please refresh and try again.")}
      />
      <button
        disabled={!ready}
        className="mt-6 min-h-12 w-full rounded-xl bg-linear-to-r from-coral to-orange px-5 py-3 font-bold disabled:opacity-50"
        onClick={async () => {
          try {
            if (!window.Cashfree) throw new Error();
            await window
              .Cashfree({ mode })
              .checkout({ paymentSessionId: sessionId, redirectTarget: "_self" });
          } catch {
            setError("Payment could not start. Please try again.");
          }
        }}
      >
        Continue to payment
      </button>
      <p className="mt-4 text-sm font-semibold text-teal">🔒 Secure payment by Cashfree</p>
      <p className="mt-2 text-sm text-muted">UPI, cards and netbanking</p>
      {error && (
        <p role="alert" className="mt-4 text-danger">
          {error}
        </p>
      )}
    </>
  );
}
