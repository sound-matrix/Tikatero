import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

const mocked = vi.hoisted(() => ({ service: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocked.service }));
vi.mock("@/lib/email/send", () => ({ send: mocked.send }));
import { completeSignup, sendWelcomeOnce } from "./complete-signup";
import type { Account } from "./routing";

const id = "f1900001-0000-4000-8000-000000000001";
const welcome = { profileId: id, email: "host@example.test", intent: "organiser" as const };
const account = {
  profile: {
    id,
    full_name: null,
    phone: null,
    role: "attendee",
    blocked_at: null,
    block_reason: null,
  },
  organisers: [],
} satisfies Account;

beforeEach(() => {
  vi.clearAllMocks();
  mocked.send.mockResolvedValue({ status: "sent" });
});

it("claims a welcome once even when two completion callbacks race", async () => {
  let timestamp: string | null = null;
  mocked.service.mockReturnValue({
    from: () => ({
      update: ({ welcome_email_sent_at }: { welcome_email_sent_at: string }) => ({
        eq: () => ({
          is: () => ({
            select: async () => {
              if (timestamp) return { data: [], error: null };
              timestamp = welcome_email_sent_at;
              return { data: [{ id }], error: null };
            },
          }),
        }),
      }),
    }),
  });
  await Promise.all([sendWelcomeOnce(welcome), sendWelcomeOnce(welcome)]);
  expect(mocked.send).toHaveBeenCalledOnce();
  expect(mocked.send).toHaveBeenCalledWith({
    template: "welcome_organiser",
    to: welcome.email,
    entityRef: `welcome:${id}`,
    data: {},
  });
});

it("creates a host draft without making the signup intent a role", async () => {
  mocked.service.mockReturnValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { signup_intent: "organiser", welcome_email_sent_at: null },
            error: null,
          }),
        }),
      }),
    }),
  });
  const insert = vi.fn().mockResolvedValue({ error: null });
  const client = {
    from: () => ({ insert }),
    auth: { getUser: async () => ({ data: { user: { email: welcome.email } } }) },
  };
  const result = await completeSignup(client as never, account);
  expect(result).toEqual({ path: "/console/pending", welcome });
  expect(insert).toHaveBeenCalledWith({
    id,
    owner_id: id,
    slug: `organiser-${id}`,
    display_name: "",
    kyc_status: "draft",
  });
});
