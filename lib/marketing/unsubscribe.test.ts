import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { promotionEmailConfigured, signUnsubscribe, verifyUnsubscribe } from "./unsubscribe";

const id = "f2500000-0000-4000-8000-000000000001";
beforeEach(() => vi.stubEnv("PROMOTIONS_UNSUBSCRIBE_SECRET", "test-secret-32-bytes-long-for-hmac-checking"));
afterEach(() => vi.unstubAllEnvs());

it("creates an opaque signed unsubscribe link and rejects tampering", () => {
  const token = signUnsubscribe(id);
  expect(verifyUnsubscribe(token)).toBe(id);
  expect(verifyUnsubscribe(token.replace(id, "f2500000-0000-4000-8000-000000000002"))).toBeNull();
  expect(verifyUnsubscribe("invalid")).toBeNull();
  expect(verifyUnsubscribe(token.slice(0, -2) + "ff")).toBeNull();
});

it("never activates email promotions without the explicit flag and full configuration", () => {
  vi.stubEnv("PROMOTIONS_EMAIL_ENABLED", "false");
  vi.stubEnv("RESEND_API_KEY", "fake");
  vi.stubEnv("EMAIL_FROM", "Tikatero <events@tikatero.example>");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://tikatero.example");
  expect(promotionEmailConfigured()).toBe(false);
  vi.stubEnv("PROMOTIONS_EMAIL_ENABLED", "true");
  expect(promotionEmailConfigured()).toBe(true);
  vi.stubEnv("PROMOTIONS_UNSUBSCRIBE_SECRET", "");
  expect(promotionEmailConfigured()).toBe(false);
});
