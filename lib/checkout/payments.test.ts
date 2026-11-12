import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, connection: async () => {} };
});
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.10" }),
  cookies: async () => ({
    set() {},
    get() {
      return undefined;
    },
    getAll() {
      return [];
    },
  }),
}));
const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  createUser: vi.fn(),
  sessionClient: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ sessionClient: mock.sessionClient }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc: mock.rpc,
    from: mock.from,
    auth: { admin: { createUser: mock.createUser } },
  }),
}));
import { submitCheckout } from "@/app/(public)/e/[slug]/checkout/actions";
import { checkoutData } from "@/lib/checkout/store";
import { INTERNATIONAL_PAID_TICKETS } from "@/lib/kyc/paid-tickets";
import { PAYMENTS_UNAVAILABLE } from "@/lib/payments/model";
import { computePricing } from "@/lib/pricing/compute";
import { launchPricing } from "@/lib/pricing";

const tierId = "11000000-0000-4000-8000-000000000001";
const buyerId = "11000000-0000-4000-8000-000000000099";
const fixture: {
  event: Record<string, unknown>;
  organiser: Record<string, unknown>;
  tiers: Record<string, unknown>[];
  international: boolean;
} = { event: {}, organiser: {}, tiers: [], international: false };

function query(load: () => { data: unknown; error: null }) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    order: () => builder,
    or: () => builder,
    limit: () => builder,
    update: () => builder,
    maybeSingle: () => Promise.resolve(load()),
    single: () => Promise.resolve(load()),
    then: (
      onFulfilled: (value: { data: unknown; error: null }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(load()).then(onFulfilled, onRejected),
  };
  return builder;
}

function useEvent(slug: string, isFree: boolean) {
  fixture.event = {
    id: "11000000-0000-4000-8000-000000000002",
    organiser_id: "11000000-0000-4000-8000-000000000003",
    slug,
    is_free: isFree,
    fee_payer: "organiser",
    ends_at: "2027-06-01T00:00:00.000Z",
    starts_at: "2027-05-01T00:00:00.000Z",
    status: "published",
  };
  fixture.organiser = {
    id: fixture.event.organiser_id,
    kyc_status: "approved",
    sales_paused: false,
    cashfree_vendor_id: "vendor_test",
  };
  fixture.tiers = [{ id: tierId, price_paise: 100000 }];
}

function booking(slug: string, isFree: boolean) {
  const { total } = computePricing({
    lines: [{ price_paise: 100000, qty: 1 }],
    version: launchPricing,
    fee_payer: "organiser",
    is_free: isFree,
  });
  return {
    slug,
    quotedTotal: total.buyer_total,
    pricingVersionId: launchPricing.id,
    name: "Test Buyer",
    email: "buyer@example.test",
    phone: "9876543210",
    consent: true as const,
    lines: [{ id: tierId, qty: 1 }],
    attendees: [],
    recaptcha: "",
  };
}

function holdCall() {
  return mock.rpc.mock.calls.find((call) => call[0] === "checkout_hold");
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.sessionClient.mockResolvedValue(null);
  fixture.international = false;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("RECAPTCHA_SECRET_KEY", "");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  mock.from.mockImplementation((table: string) =>
    query(() => {
      if (table === "events") return { data: fixture.event, error: null };
      if (table === "organisers") return { data: fixture.organiser, error: null };
      if (table === "kyc_applications")
        return { data: fixture.international ? [{ id: "intl" }] : [], error: null };
      if (table === "ticket_types") return { data: fixture.tiers, error: null };
      return { data: null, error: null };
    }),
  );
  mock.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === "checkout_rate_limit") return { data: true, error: null };
    if (name === "checkout_user_by_email") return { data: buyerId, error: null };
    if (name === "checkout_hold" || name === "checkout_hold_with_profile") {
      const amounts = args.p_amounts as { buyer_total: number; organiser_share: number };
      return {
        data: {
          id: args.p_order_id,
          status: "pending",
          total_paise: amounts.buyer_total,
          buyer_phone: args.p_phone,
          buyer_name: args.p_name,
          buyer_email: args.p_email,
          organiser_share_paise: amounts.organiser_share,
          vendor_id: fixture.organiser.cashfree_vendor_id,
          hold_expires_at: new Date(Date.now() + 600_000).toISOString(),
        },
        error: null,
      };
    }
    if (name === "checkout_transition") return { data: "paid", error: null };
    return { data: null, error: { message: name } };
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("disables production checkout and creates no hold when payments are not configured", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("CASHFREE_ENV", "");
  vi.stubEnv("CASHFREE_APP_ID", "");
  vi.stubEnv("CASHFREE_SECRET_KEY", "");
  vi.stubEnv("PAYMENTS_ALLOW_MOCK", "");
  useEvent("prod-unconfigured", false);
  const data = await checkoutData("prod-unconfigured");
  expect(data?.disabled).toBe(PAYMENTS_UNAVAILABLE);
  const result = await submitCheckout(booking("prod-unconfigured", false));
  expect(result).toEqual({ error: PAYMENTS_UNAVAILABLE });
  expect(holdCall()).toBeUndefined();
  expect(mock.createUser).not.toHaveBeenCalled();
});

it("stores an explicit production mock order as a test order", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("PAYMENTS_ALLOW_MOCK", "true");
  vi.stubEnv("CASHFREE_ENV", "mock");
  vi.stubEnv("CASHFREE_APP_ID", "");
  vi.stubEnv("CASHFREE_SECRET_KEY", "");
  useEvent("prod-mock", false);
  const data = await checkoutData("prod-mock");
  expect(data?.disabled).toBe("");
  expect(data?.mode).toBe("mock");
  const result = await submitCheckout(booking("prod-mock", false));
  expect(result.url).toMatch(/^\/orders\/[0-9a-f-]+\/pay$/);
  expect(holdCall()?.[1]).toMatchObject({ p_provider: "mock", p_is_test: true });
});

it.each([
  ["preview", "production", "preview"],
  ["dev", "development", ""],
])("allows mock when %s has no Cashfree keys", async (label, nodeEnv, vercelEnv) => {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("VERCEL_ENV", vercelEnv);
  vi.stubEnv("CASHFREE_ENV", "");
  vi.stubEnv("CASHFREE_APP_ID", "");
  vi.stubEnv("CASHFREE_SECRET_KEY", "");
  vi.stubEnv("PAYMENTS_ALLOW_MOCK", "");
  const slug = `${label}-unset`;
  useEvent(slug, false);
  expect((await checkoutData(slug))?.mode).toBe("mock");
  const result = await submitCheckout(booking(slug, false));
  expect(result.url).toMatch(/^\/orders\/[0-9a-f-]+\/pay$/);
  expect(holdCall()?.[1]).toMatchObject({ p_provider: "mock", p_is_test: true });
});

it("fails closed for live production checkout when reCAPTCHA is not configured", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("CASHFREE_ENV", "production");
  vi.stubEnv("CASHFREE_APP_ID", "app");
  vi.stubEnv("CASHFREE_SECRET_KEY", "secret");
  vi.stubEnv("RECAPTCHA_SECRET_KEY", "");
  vi.stubEnv("PAYMENTS_ALLOW_MOCK", "");
  useEvent("prod-no-recaptcha", false);
  const result = await submitCheckout(booking("prod-no-recaptcha", false));
  expect(result).toEqual({ error: PAYMENTS_UNAVAILABLE });
  expect(holdCall()).toBeUndefined();
});

it("still books a free event when production payments are not configured", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("CASHFREE_ENV", "");
  vi.stubEnv("CASHFREE_APP_ID", "");
  vi.stubEnv("CASHFREE_SECRET_KEY", "");
  vi.stubEnv("PAYMENTS_ALLOW_MOCK", "");
  useEvent("prod-free", true);
  expect((await checkoutData("prod-free"))?.disabled).toBe("");
  const result = await submitCheckout(booking("prod-free", true));
  expect(result.url).toMatch(/^\/orders\/[0-9a-f-]+\/status$/);
  expect(holdCall()?.[1]).toMatchObject({ p_provider: "free", p_is_test: false });
});

it.each(["NEXT_PUBLIC_RECAPTCHA_SITE_KEY", "RECAPTCHA_SECRET_KEY"])(
  "live checkout creates no buyer/order/hold when %s is missing",
  async (missing) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("CASHFREE_ENV", "production");
    vi.stubEnv("CASHFREE_APP_ID", "test-app");
    vi.stubEnv("CASHFREE_SECRET_KEY", "test-secret");
    vi.stubEnv("PAYMENTS_ALLOW_MOCK", "");
    vi.stubEnv("NEXT_PUBLIC_RECAPTCHA_SITE_KEY", "site");
    vi.stubEnv("RECAPTCHA_SECRET_KEY", "test-secret");
    vi.stubEnv(missing, "");
    useEvent("missing-key", false);
    expect(await submitCheckout(booking("missing-key", false))).toEqual({
      error: PAYMENTS_UNAVAILABLE,
    });
    expect(holdCall()).toBeUndefined();
    expect(mock.createUser).not.toHaveBeenCalled();
  },
);
it.each([0.1, 0.49])("low score %s creates no buyer/order/hold", async (score) => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("CASHFREE_ENV", "production");
  vi.stubEnv("CASHFREE_APP_ID", "test-app");
  vi.stubEnv("CASHFREE_SECRET_KEY", "test-secret");
  vi.stubEnv("NEXT_PUBLIC_RECAPTCHA_SITE_KEY", "site");
  vi.stubEnv("RECAPTCHA_SECRET_KEY", "test-secret");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ success: true, hostname: "tikatero.com", action: "checkout", score }),
      ),
  );
  try {
    useEvent("low-score", false);
    const result = await submitCheckout({ ...booking("low-score", false), recaptcha: "token" });
    expect(result.error).toBe("We couldn't confirm you're not a robot. Please try again.");
    expect(holdCall()).toBeUndefined();
    expect(mock.createUser).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("blocks international paid checkout before creating a hold or buyer", async () => {
  useEvent("international-paid", false);
  fixture.international = true;
  expect(await submitCheckout(booking("international-paid", false))).toEqual({
    error: INTERNATIONAL_PAID_TICKETS,
  });
  expect(holdCall()).toBeUndefined();
  expect(mock.createUser).not.toHaveBeenCalled();
});

it("keeps international free RSVP available", async () => {
  useEvent("international-free", true);
  fixture.international = true;
  fixture.tiers = [{ id: tierId, price_paise: 0 }];
  expect((await submitCheckout(booking("international-free", true))).url).toMatch(
    /^\/orders\/[0-9a-f-]+\/status$/,
  );
  expect(holdCall()?.[1]).toMatchObject({ p_provider: "free" });
});

it("binds a signed-in order and Cashfree checkout to the verified session and keeps the referral", async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("CASHFREE_ENV", "sandbox");
  vi.stubEnv("CASHFREE_APP_ID", "synthetic-app");
  vi.stubEnv("CASHFREE_SECRET_KEY", "synthetic-secret");
  useEvent("signed-in-checkout", false);
  mock.sessionClient.mockResolvedValue({
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: buyerId,
            email: "login@example.test",
            email_confirmed_at: new Date().toISOString(),
          },
        },
      }),
    },
  });
  const create = vi.fn(async (_url: string, request: RequestInit) => {
    const input = JSON.parse(String(request.body));
    expect(input.customer_details).toMatchObject({
      customer_id: buyerId,
      customer_phone: "9876543210",
    });
    expect(input.order_meta.payment_methods).toBe("upi");
    return {
      ok: true,
      json: async () => ({
        order_id: input.order_id,
        order_amount: input.order_amount,
        order_currency: "INR",
        payment_session_id: "signed-in-test",
      }),
    };
  });
  vi.stubGlobal("fetch", create);
  const result = await submitCheckout({
    ...booking("signed-in-checkout", false),
    ref: "whatsapp",
    preferredMethod: "upi",
  });
  expect(result.payment?.sessionId).toBe("signed-in-test");
  expect(create).toHaveBeenCalledOnce();
  expect(mock.rpc).toHaveBeenCalledWith(
    "checkout_hold_with_profile",
    expect.objectContaining({
      p_buyer_id: buyerId,
      p_login_email: "login@example.test",
      p_email: "buyer@example.test",
      p_ref_channel: "whatsapp",
    }),
  );
  expect(mock.rpc.mock.calls.some(([name]) => name === "checkout_user_by_email")).toBe(false);
});
