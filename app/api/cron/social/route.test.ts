import { afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/social/worker", () => ({
  runSocialCron: vi.fn(async () => ({ configured: false })),
}));

import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
});

it("returns 401 without the cron bearer", async () => {
  vi.stubEnv("CRON_SECRET", "synthetic-cron-secret");
  expect((await GET(new Request("https://example.test/api/cron/social"))).status).toBe(401);
  expect(
    (
      await GET(
        new Request("https://example.test/api/cron/social", {
          headers: { authorization: "Bearer wrong" },
        }),
      )
    ).status,
  ).toBe(401);
  const ok = await GET(
    new Request("https://example.test/api/cron/social", {
      headers: { authorization: "Bearer synthetic-cron-secret" },
    }),
  );
  expect(ok.status).toBe(200);
  expect(ok.headers.get("cache-control")).toBe("no-store");
  expect(await ok.json()).toEqual({ configured: false });
});
