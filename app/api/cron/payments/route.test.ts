import { existsSync, readFileSync } from "node:fs";
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

it("schedules the Vercel payments cron every five minutes", () => {
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
    crons: { path: string; schedule: string }[];
  };
  expect(vercel.crons).toEqual([{ path: "/api/cron/payments", schedule: "*/5 * * * *" }]);
  expect(existsSync(".github/workflows/payments-cron.yml")).toBe(false);
});
