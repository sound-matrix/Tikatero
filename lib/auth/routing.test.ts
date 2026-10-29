import { describe, expect, it } from "vitest";
import { landingPath, routeRedirect, type Account } from "./routing";

function account(
  role: Account["profile"]["role"] = "attendee",
  statuses: Account["organisers"][number]["kyc_status"][] = [],
  blocked = false,
): Account {
  return {
    profile: {
      id: "user",
      full_name: null,
      phone: null,
      role,
      blocked_at: blocked ? "2026-10-29" : null,
      block_reason: blocked ? "Review needed" : null,
    },
    organisers: statuses.map((kyc_status, i) => ({ id: String(i), kyc_status })),
  };
}

describe("role routing uses profiles and actual memberships", () => {
  it.each([
    [account(), "/me"],
    [account("organiser"), "/me"],
    ...["draft", "submitted", "auto_passed", "needs_docs", "rejected"].map((status) => [
      account("organiser", [status as Account["organisers"][number]["kyc_status"]]),
      "/console/pending",
    ]),
    [account("attendee", ["approved"]), "/console"],
    [account("organiser", ["draft", "approved"]), "/console"],
    [account("staff"), "/admin"],
    [account("admin", ["approved"]), "/admin"],
    [account("admin", ["approved"], true), "/blocked"],
  ])("lands %# on the expected surface", (input, expected) => {
    expect(landingPath(input as Account)).toBe(expected);
  });
  it("denies cross-surface URLs including nested routes", () => {
    expect(routeRedirect(account(), "/admin/organisers")).toBe("/me");
    expect(routeRedirect(account(), "/console/settings")).toBe("/me");
    expect(routeRedirect(account("organiser", ["draft"]), "/console/events")).toBe(
      "/console/pending",
    );
    expect(routeRedirect(account("organiser", ["draft"]), "/console/pending/extra")).toBe(
      "/console/pending",
    );
    expect(routeRedirect(account("organiser", ["draft"]), "/console/pending")).toBeNull();
    expect(routeRedirect(account("organiser", ["approved"]), "/admin")).toBe("/console");
    expect(routeRedirect(account("staff"), "/console")).toBe("/admin");
    expect(routeRedirect(account("staff"), "/admin/events")).toBeNull();
    expect(routeRedirect(account("organiser", ["approved"]), "/console/events")).toBeNull();
  });
  it("blocks every protected surface and does not loop on the block page", () => {
    for (const path of [
      "/login",
      "/me",
      "/me/settings",
      "/admin",
      "/console/pending",
      "/auth/complete",
    ]) {
      expect(routeRedirect(account("staff", [], true), path)).toBe("/blocked");
    }
    expect(routeRedirect(account("staff", [], true), "/blocked")).toBeNull();
    expect(routeRedirect(account(), "/blocked")).toBe("/me");
  });
});
