import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "./headers";

it("sends a strict baseline without unsafe-eval", () => {
  const policy = contentSecurityPolicy({
    supabaseUrl: "http://127.0.0.1:54321",
  });
  expect(policy).not.toContain("unsafe-eval");
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).toContain("https://www.google.com/recaptcha/");
  expect(policy).toContain("https://sdk.cashfree.com");
  expect(policy).not.toContain("cloudflare");
  expect(policy).toContain("https://www.gstatic.com/recaptcha/");
  expect(policy).toContain("https://recaptcha.google.com/recaptcha/");
  expect(policy).toContain(
    "img-src 'self' data: blob: https://tile.openstreetmap.org http://127.0.0.1:54321",
  );
  expect(policy).toContain("http://127.0.0.1:54321");
  expect(policy).toContain("ws://127.0.0.1:54321");
  const headers = Object.fromEntries(securityHeaders().map((header) => [header.key, header.value]));
  expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  expect(headers["X-Frame-Options"]).toBe("DENY");
  expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["Strict-Transport-Security"]).toContain("max-age=");
});

it("pins functions to Mumbai and keeps the payments cron", () => {
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  expect(vercel.regions).toEqual(["bom1"]);
  expect(vercel.crons).toEqual([{ path: "/api/cron/payments", schedule: "*/5 * * * *" }]);
  const payouts = readFileSync("app/console/payouts/page.tsx", "utf8");
  expect(payouts).not.toContain("payoutWindowCopy(2)");
  expect(payouts).toContain("payoutWindowDays");
});
