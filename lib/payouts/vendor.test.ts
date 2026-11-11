import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const orgId = "11000000-0000-4000-8000-000000000010";
const state = vi.hoisted(() => ({
  bankName: "Alex Shah",
  legalName: "Alex Shah",
  vendorId: null as string | null,
  updates: [] as string[],
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder = {
        select: () => builder,
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        is: () => builder,
        update: (values: { cashfree_vendor_id?: string }) => {
          if (values.cashfree_vendor_id) state.updates.push(values.cashfree_vendor_id);
          return builder;
        },
        single: async () => ({
          data:
            table === "organisers"
              ? {
                  id: orgId,
                  legal_name: state.legalName,
                  cashfree_vendor_id: state.vendorId,
                  kyc_status: "approved",
                }
              : null,
          error: null,
        }),
        maybeSingle: async () => ({
          data: {
            pan_name: state.legalName,
            bank_holder_name: state.bankName,
            step_progress: {},
          },
          error: null,
        }),
      };
      return builder;
    },
  }),
}));

import { LIVE_VENDOR_UNAVAILABLE } from "./model";
import { ensureSplitVendor } from "./vendor";

beforeEach(() => {
  state.bankName = "Alex Shah";
  state.legalName = "Alex Shah";
  state.vendorId = null;
  state.updates.length = 0;
  vi.stubEnv("KYC_NAME_MATCH_THRESHOLD", "");
  vi.stubEnv("PAYMENTS_ALLOW_MOCK", "");
  vi.stubEnv("CASHFREE_APP_ID", "");
  vi.stubEnv("CASHFREE_SECRET_KEY", "");
  vi.stubEnv("CASHFREE_ENV", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("saves a mock vendor in mock mode and does not call Cashfree", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch");
  await expect(ensureSplitVendor(orgId)).resolves.toBe(`mock_vendor_${orgId.replaceAll("-", "")}`);
  expect(state.updates).toEqual([`mock_vendor_${orgId.replaceAll("-", "")}`]);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("refuses a live vendor when production has no Cashfree keys and saves nothing", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "production");
  const fetchMock = vi.spyOn(globalThis, "fetch");
  await expect(ensureSplitVendor(orgId)).rejects.toThrow(LIVE_VENDOR_UNAVAILABLE);
  expect(state.updates).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(JSON.stringify(state.updates)).not.toContain("1234567890");
});

it("does not call Cashfree when live keys exist but no account number is stored", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("CASHFREE_ENV", "production");
  vi.stubEnv("CASHFREE_APP_ID", "app");
  vi.stubEnv("CASHFREE_SECRET_KEY", "secret");
  const fetchMock = vi.spyOn(globalThis, "fetch");
  await expect(ensureSplitVendor(orgId)).rejects.toThrow(LIVE_VENDOR_UNAVAILABLE);
  expect(state.updates).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("refuses before any provider call when the bank name does not match", async () => {
  state.bankName = "Someone Else";
  const fetchMock = vi.spyOn(globalThis, "fetch");
  await expect(ensureSplitVendor(orgId)).rejects.toThrow(/does not match/);
  expect(state.updates).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
});
