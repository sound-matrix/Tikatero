import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({ insert: vi.fn(), fetch: vi.fn(), notice: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({
  allowRequest: async () => true,
  requestIp: async () => "127.0.0.1",
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ from: () => ({ insert: mock.insert }) }),
}));
vi.mock("@/lib/contact/send", () => ({ sendContactNotice: mock.notice }));
import { submitContact } from "@/app/(public)/contact/actions";
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    name: "Priya Shah",
    email: "priya@example.test",
    topic: "refund",
    message: "Please help with my ticket refund.",
    started: String(Date.now() - 10000),
    recaptcha: "token",
  }))
    data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_RECAPTCHA_SITE_KEY", "");
  vi.stubEnv("RECAPTCHA_SECRET_KEY", "");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", crypto.randomUUID());
  mock.insert.mockReturnValue({
    select: () => ({ single: async () => ({ data: { id: "id" }, error: null }) }),
  });
  mock.notice.mockResolvedValue(false);
  vi.stubGlobal("fetch", mock.fetch);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("submits without captcha keys and preserves the saved-message flow", async () => {
  expect((await submitContact({}, form())).success?.firstName).toBe("Priya");
  expect(mock.insert).toHaveBeenCalledOnce();
  expect(mock.fetch).not.toHaveBeenCalled();
});
it("rejects low-score configured captcha before saving or sending", async () => {
  vi.stubEnv("NEXT_PUBLIC_RECAPTCHA_SITE_KEY", "site");
  vi.stubEnv("RECAPTCHA_SECRET_KEY", "test");
  mock.fetch.mockResolvedValue(
    Response.json({ success: true, action: "contact", hostname: "tikatero.com", score: 0.1 }),
  );
  expect((await submitContact({}, form())).error).toContain("couldn't confirm");
  expect(mock.insert).not.toHaveBeenCalled();
  expect(mock.notice).not.toHaveBeenCalled();
});
