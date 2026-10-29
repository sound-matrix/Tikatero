import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Account } from "./routing";
const mock = vi.hoisted(() => ({ account: vi.fn(), refresh: false }));
vi.mock("@/lib/auth/account", () => ({ readAccount: mock.account }));
vi.mock("@/lib/supabase/env", () => ({
  publicSupabaseEnv: () => ({ url: "http://localhost:54321", key: "public-test-key" }),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: { cookies: { setAll: (cookies: unknown[], headers: object) => void } },
  ) => {
    if (mock.refresh)
      options.cookies.setAll(
        [
          {
            name: "refreshed-session",
            value: "test-session",
            options: { path: "/", sameSite: "lax" },
          },
        ],
        { "Cache-Control": "private, no-store" },
      );
    return {};
  },
}));
import { proxy } from "@/proxy";
const attendee: Account = {
  profile: {
    id: "user",
    full_name: null,
    phone: null,
    role: "attendee",
    blocked_at: null,
    block_reason: null,
  },
  organisers: [],
};
beforeEach(() => {
  mock.refresh = false;
  mock.account.mockReset();
});
it("redirects anonymous nested console requests to login without carrying query parameters", async () => {
  mock.account.mockResolvedValue(null);
  const result = await proxy(
    new NextRequest("http://localhost/console/settings?next=https://evil.invalid"),
  );
  expect(result.status).toBe(303);
  expect(result.headers.get("location")).toBe("http://localhost/login");
  expect(result.headers.get("cache-control")).toContain("no-store");
});
it("preserves refreshed session cookies through a role redirect", async () => {
  mock.refresh = true;
  mock.account.mockResolvedValue(attendee);
  const result = await proxy(new NextRequest("http://localhost/admin/accounts"));
  expect(result.headers.get("location")).toBe("http://localhost/me");
  expect(result.cookies.get("refreshed-session")?.value).toBe("test-session");
});
it("fails closed on a database outage without leaking errors", async () => {
  mock.account.mockRejectedValue(new Error("private provider failure"));
  const result = await proxy(new NextRequest("http://localhost/admin"));
  expect(result.status).toBe(503);
  expect(await result.text()).not.toContain("private provider failure");
});
it("allows the login screen for an anonymous visitor", async () => {
  mock.account.mockResolvedValue(null);
  const result = await proxy(new NextRequest("http://localhost/login"));
  expect(result.headers.get("location")).toBeNull();
});
