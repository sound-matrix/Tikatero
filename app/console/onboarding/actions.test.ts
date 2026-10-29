import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({
  account: vi.fn(),
  load: vi.fn(),
  rpc: vi.fn(),
  notify: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/auth/account", () => ({ requireAccount: mock.account }));
vi.mock("@/lib/kyc/store", () => ({
  loadApplication: mock.load,
  applicationDto: (value: unknown) => value,
  progressJson: (value: unknown) => JSON.parse(JSON.stringify(value)),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ rpc: mock.rpc }) }));
vi.mock("@/lib/kyc/notify", () => ({ notifyKycSubmitted: mock.notify }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
import { saveKycStep } from "./actions";
import type { Application, FlowState, Progress } from "@/lib/kyc/model";
const organiserId = "f1111111-1111-4111-8111-111111111111";
const otherId = "f2222222-2222-4222-8222-222222222222";
const details = {
  displayName: "Riverfront",
  legalName: "Alex Shah",
  type: "individual" as const,
  phone: "9876543210",
  city: "Pune",
};
const check = {
  completed: true,
  passed: true,
  mode: "mock" as const,
  ref: "mock-reference",
  score: 99,
  faceScore: 99,
};
const complete: Progress = {
  details,
  pan: { ...check },
  aadhaar: { ...check },
  gstin: { ...check, skipped: true },
  bank: { ...check },
  selfie: { ...check },
};
const initial: FlowState = {
  organiserId,
  displayName: "Riverfront",
  mode: "mock",
  application: null,
};
const application = (progress: Progress = { details }): Application => ({
  id: otherId,
  organiser_id: organiserId,
  status: "draft",
  revision: 2,
  step_progress: progress,
  flagged_steps: [],
  reviewer_note: null,
  submission_count: 0,
});
const form = (step: string, values: Record<string, string> = {}) => {
  const data = new FormData();
  data.set("organiserId", organiserId);
  data.set("step", step);
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("KYC_MODE", "mock");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("KYC_NAME_MATCH_THRESHOLD", "");
  mock.account.mockResolvedValue({
    client: {},
    account: {
      profile: { id: organiserId, blocked_at: null },
      organisers: [{ id: organiserId, kyc_status: "draft" }],
    },
  });
  mock.load.mockResolvedValue(application());
  mock.rpc.mockImplementation(async (_name, args) => ({
    data: [
      {
        ...application(args.p_progress),
        revision: args.p_revision + 1,
        status: args.p_status,
        submission_count: args.p_submit ? 1 : 0,
        flagged_steps: args.p_flagged,
      },
    ],
    error: null,
  }));
});
afterEach(() => vi.unstubAllEnvs());
it("denies another organiser before reading private data or writing", async () => {
  const result = await saveKycStep(initial, form("details", { organiserId: otherId }));
  expect(result.error).toContain("permission");
  expect(mock.load).not.toHaveBeenCalled();
  expect(mock.rpc).not.toHaveBeenCalled();
  expect(result.application).toBeNull();
});
it("denies blocked memberships", async () => {
  mock.account.mockResolvedValue({
    client: {},
    account: {
      profile: { id: organiserId, blocked_at: "2026-10-29" },
      organisers: [{ id: organiserId, kyc_status: "draft" }],
    },
  });
  expect((await saveKycStep(initial, form("pan"))).error).toContain("permission");
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("re-reads state instead of trusting forged previous progress or revision", async () => {
  const forged = {
    ...initial,
    application: { ...application(complete), revision: 999, status: "approved" },
  };
  const pan = ["ABCDE", "1234", "F"].join("");
  const result = await saveKycStep(forged, form("pan", { number: pan }));
  expect(result.error).toBeUndefined();
  const args = mock.rpc.mock.calls[0][1];
  expect(args.p_revision).toBe(2);
  expect(args.p_progress).not.toHaveProperty("bank");
  expect(JSON.stringify(args)).not.toContain(pan);
  expect(args.p_progress.pan.last4).toBe("234F");
});
it("masks bank numbers and GSTIN (which contains PAN) before any persistence", async () => {
  mock.load.mockResolvedValue(application(complete));
  const number = "98765432100123";
  await saveKycStep(initial, form("bank", { number, ifsc: "TEST0123456" }));
  expect(JSON.stringify(mock.rpc.mock.calls)).not.toContain(number);
  expect(mock.rpc.mock.calls[0][1].p_progress.bank.last4).toBe("0123");
  mock.rpc.mockClear();
  const gstin = ["27", "ABCDE", "1234", "F1Z5"].join("");
  await saveKycStep(initial, form("gstin", { number: gstin }));
  expect(JSON.stringify(mock.rpc.mock.calls)).not.toContain(gstin);
  expect(JSON.stringify(mock.rpc.mock.calls)).not.toContain(["ABCDE", "1234", "F"].join(""));
});
it("rejects private document keys belonging to another organiser", async () => {
  mock.load.mockResolvedValue(application(complete));
  const result = await saveKycStep(
    initial,
    form("selfie", {
      method: "upload",
      docKey: `kyc_doc/${otherId}/11111111-1111-4111-8111-111111111111.jpg`,
    }),
  );
  expect(result.error).toContain("this organiser");
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("manual document fallback always queues a human review", async () => {
  mock.load.mockResolvedValue(application(complete));
  const result = await saveKycStep(
    initial,
    form("selfie", {
      method: "upload",
      docKey: `kyc_doc/${organiserId}/11111111-1111-4111-8111-111111111111.jpg`,
    }),
  );
  expect(result.application?.step_progress.selfie?.passed).toBe(false);
  expect(result.application?.step_progress.selfie?.mode).toBe("manual");
});
it("prevents out-of-order checks and incomplete submission", async () => {
  mock.load.mockResolvedValue(null);
  expect(
    (await saveKycStep(initial, form("bank", { number: "98765432100123", ifsc: "TEST0123456" })))
      .error,
  ).toContain("organiser details");
  expect((await saveKycStep(initial, form("submit"))).error).toContain("finish each step");
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("submits complete mock checks into auto_passed without granting approval", async () => {
  mock.load.mockResolvedValue(application(complete));
  const result = await saveKycStep(initial, form("submit"));
  expect(result.application?.status).toBe("auto_passed");
  expect(mock.notify).toHaveBeenCalledOnce();
  expect(mock.rpc.mock.calls[0][1]).toMatchObject({
    p_user_id: organiserId,
    p_organiser_id: organiserId,
    p_submit: true,
    p_status: "auto_passed",
  });
});
it("reopens only flagged steps and accepts a corrected resubmission", async () => {
  const prior = {
    ...application({ ...complete, bank: { ...check, score: 40, passed: false } }),
    status: "needs_docs",
    flagged_steps: ["bank"],
  };
  mock.load.mockResolvedValue(prior);
  expect(
    (await saveKycStep(initial, form("pan", { number: ["ABCDE", "1234", "F"].join("") }))).error,
  ).toContain("Only the steps");
  expect(mock.rpc).not.toHaveBeenCalled();
  const saved = await saveKycStep(
    initial,
    form("bank", { number: "98765432100123", ifsc: "TEST0123456" }),
  );
  expect(saved.error).toBeUndefined();
  mock.load.mockResolvedValue(saved.application);
  const submitted = await saveKycStep(initial, form("submit"));
  expect(submitted.application?.status).toBe("auto_passed");
  expect(submitted.application?.flagged_steps).toEqual([]);
});
it("keeps failed/low scores in needs_docs and holds submitted applications", async () => {
  mock.load.mockResolvedValue(
    application({ ...complete, pan: { ...check, score: 50, passed: false } }),
  );
  const result = await saveKycStep(initial, form("submit"));
  expect(result.application?.status).toBe("needs_docs");
  expect(result.application?.flagged_steps).toEqual(["pan"]);
  mock.load.mockResolvedValue({ ...application(complete), status: "auto_passed" });
  mock.rpc.mockClear();
  expect((await saveKycStep(initial, form("pan"))).error).toContain("already");
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("a stale database revision fails closed and does not send email", async () => {
  mock.load.mockResolvedValue(application(complete));
  mock.rpc.mockResolvedValue({ data: null, error: { message: "sensitive database context" } });
  const result = await saveKycStep(initial, form("submit"));
  expect(result.error).toContain("Reload");
  expect(result.error).not.toContain("sensitive");
  expect(mock.notify).not.toHaveBeenCalled();
});
it("keeps a submitted application saved even if email is unavailable", async () => {
  mock.load.mockResolvedValue(application(complete));
  mock.notify.mockRejectedValue(new Error("unavailable"));
  const result = await saveKycStep(initial, form("submit"));
  expect(result.success).toContain("submitted");
});

it.each([
  ["production", "production", "mock"],
  ["production", "production", ""],
  ["", "production", ""],
])(
  "holds simulated evidence for review in Vercel=%s / Node=%s / KYC=%s",
  async (vercelEnv, nodeEnv, kycMode) => {
    vi.stubEnv("VERCEL_ENV", vercelEnv);
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("KYC_MODE", kycMode);
    vi.stubEnv("CASHFREE_SECURE_ID_CLIENT_ID", "");
    vi.stubEnv("CASHFREE_SECURE_ID_CLIENT_SECRET", "");
    mock.load.mockResolvedValue(application(complete));
    const result = await saveKycStep(initial, form("submit"));
    expect(result.application?.status).toBe("needs_docs");
    expect(result.application?.flagged_steps).toEqual(["pan", "aadhaar", "bank", "selfie"]);
    expect(mock.notify).toHaveBeenCalledOnce();
  },
);
it("allows explicit local mock testing in a production Node build without a Vercel production target", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("KYC_MODE", "mock");
  mock.load.mockResolvedValue(application(complete));
  const result = await saveKycStep(initial, form("submit"));
  expect(result.application?.status).toBe("auto_passed");
});
