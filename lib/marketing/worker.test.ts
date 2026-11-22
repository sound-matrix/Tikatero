import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ send: vi.fn() }));
import { createServiceClient } from "@/lib/supabase/service";
import { send } from "@/lib/email/send";
import { runPromotionsEmailCron } from "./worker";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it("never fetches recipients or sends marketing emails when promotional sending is off", async () => {
  vi.stubEnv("PROMOTIONS_EMAIL_ENABLED", "false");
  vi.stubEnv("PROMOTIONS_UNSUBSCRIBE_SECRET", "test-secret-32-bytes-long-for-hmac-checking");
  vi.stubEnv("RESEND_API_KEY", "synthetic-key");
  vi.stubEnv("EMAIL_FROM", "events@tikatero.example");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://tikatero.example");
  expect(await runPromotionsEmailCron()).toEqual({ enabled: false, claimed: 0, sent: 0, failed: 0 });
  expect(createServiceClient).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});
