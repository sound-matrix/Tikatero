import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({ from: vi.fn(), user: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ from: mock.from, auth: { admin: { getUserById: mock.user } } }),
}));
vi.mock("@/lib/email/send", () => ({ send: mock.send }));
import { notifyAdminAction } from "./notify";
let action = "kyc_needs_docs";
beforeEach(() => {
  vi.resetAllMocks();
  action = "kyc_needs_docs";
  mock.from.mockImplementation((table: string) => ({
    select: () => ({
      eq: () => ({
        single: async () => ({
          data:
            table === "audit_log"
              ? {
                  id: "audit-1",
                  action,
                  entity_id: "target-1",
                  after: { flagged_steps: ["bank", "selfie"] },
                  reason: "Please send clear proof",
                }
              : table === "kyc_applications"
                ? { organiser_id: "org-1" }
                : { owner_id: "owner-1", display_name: "Riverfront" },
        }),
      }),
    }),
  }));
  mock.user.mockResolvedValue({ data: { user: { email: "owner@example.test" } } });
  mock.send.mockResolvedValue({ status: "sent" });
});
it("sends needs-docs step names and note with audit identity for idempotent retry", async () => {
  await notifyAdminAction("audit-1");
  await notifyAdminAction("audit-1");
  expect(mock.send).toHaveBeenCalledWith({
    template: "kyc_needs_docs",
    entityRef: "admin/audit-1",
    to: "owner@example.test",
    data: {
      organiserName: "Riverfront",
      requestedDocs: ["Bank account", "Selfie", "Note: Please send clear proof"],
      actionPath: "/console/onboarding",
    },
  });
  expect(mock.send.mock.calls[0]).toEqual(mock.send.mock.calls[1]);
});
it.each(["kyc_approved", "kyc_rejected", "account_block", "account_suspend"])(
  "routes %s through the existing sender",
  async (value) => {
    action = value;
    await notifyAdminAction("audit-1");
    expect(mock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        template: value.startsWith("account_") ? "account_blocked" : value,
        entityRef: "admin/audit-1",
      }),
    );
  },
);
