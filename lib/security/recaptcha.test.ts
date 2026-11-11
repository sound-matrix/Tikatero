import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { recaptchaSiteKey, verifyRecaptcha, RECAPTCHA_MIN_SCORE } from "./recaptcha";
const valid = { success: true, action: "checkout", hostname: "tikatero.com", score: 0.5 };
const fetcher = vi.fn();
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_RECAPTCHA_SITE_KEY", "public-test-site");
  vi.stubEnv("RECAPTCHA_SECRET_KEY", crypto.randomUUID());
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("RECAPTCHA_MIN_SCORE", "");
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset().mockResolvedValue(Response.json(valid));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("POSTs a token with a timeout and accepts the threshold", async () => {
  expect(RECAPTCHA_MIN_SCORE).toBe(0.5);
  expect(await verifyRecaptcha("fresh-token", "checkout")).toBe(true);
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe("https://www.google.com/recaptcha/api/siteverify");
  expect(options).toMatchObject({ method: "POST", cache: "no-store" });
  expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(options.body.get("response")).toBe("fresh-token");
});
it.each([
  { success: false },
  { success: "true" },
  { action: "contact" },
  { action: undefined },
  { hostname: "evil.test" },
  { hostname: "tikatero.com.evil.test" },
  { hostname: "preview.vercel.app" },
  { score: 0.49 },
  { score: "0.9" },
  { score: undefined },
  { score: 1.1 },
])("rejects mismatched or malformed verification %#", async (change) => {
  fetcher.mockResolvedValue(Response.json({ ...valid, ...change }));
  expect(await verifyRecaptcha("token", "checkout")).toBe(false);
});
it("allows exact primary hosts and preview hosts only outside production", async () => {
  fetcher.mockResolvedValue(Response.json({ ...valid, hostname: "www.tikatero.com" }));
  expect(await verifyRecaptcha("token", "checkout")).toBe(true);
  vi.stubEnv("VERCEL_ENV", "preview");
  fetcher.mockResolvedValue(
    Response.json({ ...valid, hostname: "tikatero-pr18.vercel.app", action: "contact" }),
  );
  expect(await verifyRecaptcha("token", "contact")).toBe(true);
  for (const hostname of ["vercel.app", "a.vercel.app.evil.test", "localhost", "evil.com"]) {
    fetcher.mockResolvedValue(Response.json({ ...valid, hostname }));
    expect(await verifyRecaptcha("token", "checkout")).toBe(false);
  }
});
it.each(["NEXT_PUBLIC_RECAPTCHA_SITE_KEY", "RECAPTCHA_SECRET_KEY"])(
  "requires both keys: %s",
  async (key) => {
    vi.stubEnv(key, " ");
    expect(recaptchaSiteKey()).toBe("");
    expect(await verifyRecaptcha("token", "checkout")).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  },
);
it("rejects absent/long tokens and network/provider failures", async () => {
  expect(await verifyRecaptcha("", "checkout")).toBe(false);
  expect(await verifyRecaptcha("x".repeat(2049), "checkout")).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockRejectedValue(new Error("timeout"));
  expect(await verifyRecaptcha("token", "checkout")).toBe(false);
  fetcher.mockResolvedValue(new Response("invalid json"));
  expect(await verifyRecaptcha("token", "checkout")).toBe(false);
  fetcher.mockResolvedValue(Response.json(valid, { status: 500 }));
  expect(await verifyRecaptcha("token", "checkout")).toBe(false);
});
it("supports a valid override and safely defaults invalid thresholds", async () => {
  vi.stubEnv("RECAPTCHA_MIN_SCORE", "0.8");
  expect(await verifyRecaptcha("token", "checkout")).toBe(false);
  for (const value of ["bad", "-1", "2"]) {
    vi.stubEnv("RECAPTCHA_MIN_SCORE", value);
    fetcher.mockResolvedValue(Response.json({ ...valid, score: 0.4 }));
    expect(await verifyRecaptcha("token", "checkout")).toBe(false);
  }
});
