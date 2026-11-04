import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
});

it("returns 401 unless the bearer matches CRON_SECRET", async () => {
  vi.stubEnv("CRON_SECRET", "synthetic-cron-secret");
  expect((await GET(new Request("https://example.test/api/cron/payments"))).status).toBe(401);
  expect(
    (
      await GET(
        new Request("https://example.test/api/cron/payments", {
          headers: { authorization: "Bearer wrong" },
        }),
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await GET(
        new Request("https://example.test/api/cron/payments", {
          headers: { authorization: "Bearer synthetic-cron-secret-extra" },
        }),
      )
    ).status,
  ).toBe(401);
});

it("keeps the Vercel cron at most once per day and the Actions poll every five minutes", () => {
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
    crons: { path: string; schedule: string }[];
  };
  expect(vercel.crons).toEqual([{ path: "/api/cron/payments", schedule: "0 3 * * *" }]);
  const workflow = readFileSync(".github/workflows/payments-cron.yml", "utf8");
  expect(workflow).toContain('cron: "*/5 * * * *"');
  expect(workflow).toContain("workflow_dispatch");
  expect(workflow).toContain("secrets.CRON_SECRET");
  expect(workflow).toContain("vars.APP_URL");
  expect(workflow).toContain("--max-time 280");
  expect(workflow).not.toMatch(/Bearer [A-Za-z0-9_-]{16,}/);
});
