import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { kycProvider } from "./index";
import { MockKycProvider } from "./mock";
import { CashfreeSecureId } from "./cashfree-secure-id";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("uses mock when requested or either Cashfree key is missing", () => {
  vi.stubEnv("CASHFREE_SECURE_ID_CLIENT_ID", "");
  vi.stubEnv("CASHFREE_SECURE_ID_CLIENT_SECRET", "");
  expect(kycProvider().mode).toBe("mock");
  vi.stubEnv("CASHFREE_SECURE_ID_CLIENT_ID", "test-id");
  expect(kycProvider().mode).toBe("mock");
  vi.stubEnv("CASHFREE_SECURE_ID_CLIENT_SECRET", "test-secret");
  vi.stubEnv("KYC_MODE", "mock");
  expect(kycProvider().mode).toBe("mock");
  vi.stubEnv("KYC_MODE", "");
  expect(kycProvider().mode).toBe("cashfree");
});
it("mock completes every check without network calls or retaining raw IDs", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const provider = new MockKycProvider();
  const pan = ["ABCDE", "1234", "F"].join(""),
    bank = "98765432100123";
  const checks = [
    await provider.pan(pan, "Alex Shah"),
    await provider.bank(bank, "TEST0123456", "Alex Shah"),
    await provider.gstin("27ABCDE1234F1Z5", "Alex Shah"),
    await provider.aadhaar((await provider.startAadhaar()).ref),
    await provider.selfie(),
  ];
  expect(checks.every((check) => check.completed && check.passed && check.mode === "mock")).toBe(
    true,
  );
  expect(JSON.stringify(checks)).not.toContain(pan);
  expect(JSON.stringify(checks)).not.toContain(bank);
  expect(fetch).not.toHaveBeenCalled();
});
it("Cashfree sends ephemeral IDs only to the fixed provider and returns an allowlist", async () => {
  vi.stubEnv("CASHFREE_SECURE_ID_ENV", "sandbox");
  const pan = ["ABCDE", "1234", "F"].join("");
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      pan,
      valid: true,
      registered_name: "Alex Shah",
      pan_status: "VALID",
      reference_id: 123,
      address: "never persisted",
    }),
  });
  vi.stubGlobal("fetch", fetch);
  const check = await new CashfreeSecureId().pan(pan, "Alex Shah");
  expect(fetch.mock.calls[0][0]).toBe("https://sandbox.cashfree.com/verification/pan");
  expect(JSON.stringify(check)).not.toContain(pan);
  expect(check).not.toHaveProperty("address");
  expect(check.score).toBe(100);
});
it("Cashfree failures never reflect provider bodies or request IDs", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: "sensitive provider response" }),
    }),
  );
  await expect(new CashfreeSecureId().pan("unused", "Alex")).rejects.toThrow(
    "The verification service is busy.",
  );
});
it("refuses invalid environments and unsafe consent redirects", async () => {
  vi.stubEnv("CASHFREE_SECURE_ID_ENV", "other");
  await expect(new CashfreeSecureId().pan("unused", "Alex")).rejects.toThrow("settings");
  vi.stubEnv("CASHFREE_SECURE_ID_ENV", "sandbox");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ url: "https://evil.example/sign-in" }) }),
  );
  await expect(
    new CashfreeSecureId().startAadhaar("https://tikatero.example/console/onboarding"),
  ).rejects.toThrow("secure sign-in link");
});
it("live Aadhaar checks provider consent and reduces a document to last four only", async () => {
  vi.stubEnv("CASHFREE_SECURE_ID_ENV", "sandbox");
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "AUTHENTICATED" }) })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        aadhaar_number: "XXXX-XXXX-1234",
        name: "Alex Shah",
        address: "not retained",
      }),
    });
  vi.stubGlobal("fetch", fetch);
  expect(await new CashfreeSecureId().aadhaar("ref-1")).toEqual({
    completed: true,
    passed: true,
    mode: "cashfree",
    ref: "ref-1",
    last4: "1234",
  });
});
