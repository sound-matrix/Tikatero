import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({ from: vi.fn(), user: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ from: mock.from, auth: { admin: { getUserById: mock.user } } }),
}));
vi.mock("@/lib/email/send", () => ({ send: mock.send }));
import { notifyKycSubmitted } from "./notify";
import type { Application } from "./model";
beforeEach(() => {
  vi.resetAllMocks();
  mock.from.mockImplementation((table: string) =>
    table === "organisers"
      ? {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { owner_id: "owner", display_name: "Riverfront" } }),
            }),
          }),
        }
      : {
          select: () => ({
            in: () => ({ is: async () => ({ data: [{ id: "staff-1" }, { id: "staff-2" }] }) }),
          }),
        },
  );
  mock.user.mockImplementation(async (id: string) => ({
    data: { user: { email: `${id}@example.test` } },
  }));
  mock.send.mockResolvedValue({ status: "skipped_not_configured" });
});
it("uses the existing wrapper for the owner and active staff with a stable submission identity", async () => {
  await notifyKycSubmitted({
    id: "application-1",
    organiser_id: "organiser-1",
    submission_count: 2,
  } as Application);
  expect(mock.send).toHaveBeenCalledTimes(3);
  expect(mock.send.mock.calls[0][0]).toMatchObject({
    to: "owner@example.test",
    template: "kyc_submitted",
    entityRef: "kyc/application-1/submission/2",
  });
  expect(
    mock.send.mock.calls
      .slice(1)
      .every(
        ([options]) =>
          options.template === "staff_alert" &&
          options.entityRef === "kyc/application-1/submission/2",
      ),
  ).toBe(true);
});
