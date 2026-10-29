import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { applicationDto } from "./store";
import type { Tables } from "@/lib/db/types";
it("returns only the organiser-facing fields from a privileged RPC row", () => {
  const row = {
    id: "application",
    organiser_id: "organiser",
    status: "draft",
    revision: 1,
    step_progress: {},
    flagged_steps: [],
    reviewer_note: null,
    submission_count: 0,
    doc_keys: ["private-object-key"],
    provider_refs: { private: "reference" },
    reviewer_id: "staff-id",
  } as unknown as Tables<"kyc_applications">;
  const dto = applicationDto(row);
  expect(dto).not.toHaveProperty("doc_keys");
  expect(dto).not.toHaveProperty("provider_refs");
  expect(dto).not.toHaveProperty("reviewer_id");
  expect(dto.revision).toBe(1);
});
