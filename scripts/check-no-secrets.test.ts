import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it("rejects server variable names, modern secrets, service-role JWTs and exact env values", () => {
  const root = mkdtempSync(join(tmpdir(), "tikatero-assets-"));
  const payload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
  try {
    for (const content of [
      "SUPABASE_SERVICE_ROLE_KEY",
      "R2_SECRET_ACCESS_KEY",
      "R2_ACCESS_KEY_ID",
      "RESEND_API_KEY",
      "CASHFREE_SECURE_ID_CLIENT_SECRET",
      "CASHFREE_APP_ID",
      "CASHFREE_SECRET_KEY",
      "CASHFREE_WEBHOOK_SECRET",
      "TURNSTILE_SECRET_KEY",
      "CRON_SECRET",
      "cashfree-private-test-sentinel",
      "resend-private-test-sentinel",
      "re_synthetic_test_value_12345678",
      "r2-private-test-sentinel",
      "sb_secret_testvalue",
      `eyJhbGciOiJIUzI1NiJ9.${payload}.testsignature`,
      "private-test-sentinel",
    ]) {
      writeFileSync(join(root, "client.js"), content);
      expect(() =>
        execFileSync(process.execPath, ["scripts/check-no-secrets.mjs", root], {
          env: {
            ...process.env,
            SUPABASE_SERVICE_ROLE_KEY: "private-test-sentinel",
            R2_SECRET_ACCESS_KEY: "r2-private-test-sentinel",
            RESEND_API_KEY: "resend-private-test-sentinel",
            CASHFREE_SECURE_ID_CLIENT_SECRET: "cashfree-private-test-sentinel",
          },
          stdio: "pipe",
        }),
      ).toThrow();
    }
    writeFileSync(join(root, "client.js"), "public asset");
    expect(() =>
      execFileSync(process.execPath, ["scripts/check-no-secrets.mjs", root], { stdio: "pipe" }),
    ).not.toThrow();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
