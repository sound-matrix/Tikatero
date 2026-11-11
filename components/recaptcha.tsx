"use client";

import Script from "next/script";

declare global {
  interface Window {
    grecaptcha?: {
      ready(callback: () => void): void;
      execute(siteKey: string, options: { action: "checkout" | "contact" }): Promise<string>;
    };
  }
}

export function RecaptchaScript({ siteKey }: { siteKey: string }) {
  return siteKey ? (
    <Script src={`https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`} />
  ) : null;
}

// Called at submission time, including every retry; tokens are never cached.
export function recaptchaToken(siteKey: string, action: "checkout" | "contact"): Promise<string> {
  if (!siteKey) return Promise.resolve("");
  return new Promise((resolve, reject) => {
    const fail = () =>
      reject(new Error("We couldn't confirm you're not a robot. Please try again."));
    const timer = setTimeout(fail, 10000);
    const api = window.grecaptcha;
    if (!api) {
      clearTimeout(timer);
      fail();
      return;
    }
    try {
      api.ready(() => {
        api
          .execute(siteKey, { action })
          .then(resolve, fail)
          .finally(() => clearTimeout(timer));
      });
    } catch {
      clearTimeout(timer);
      fail();
    }
  });
}

export function RecaptchaNotice() {
  return (
    <p className="mt-3 text-xs leading-5 text-muted">
      This site is protected by reCAPTCHA and the Google{" "}
      <a className="underline" href="https://policies.google.com/privacy">
        Privacy Policy
      </a>{" "}
      and{" "}
      <a className="underline" href="https://policies.google.com/terms">
        Terms of Service
      </a>{" "}
      apply.
    </p>
  );
}
