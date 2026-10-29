import type { Tables } from "@/lib/db/types";

export type Account = {
  profile: Pick<
    Tables<"profiles">,
    "id" | "full_name" | "phone" | "role" | "blocked_at" | "block_reason"
  >;
  organisers: Pick<Tables<"organisers">, "id" | "kyc_status">[];
};

export function landingPath(account: Account): string {
  if (account.profile.blocked_at) return "/blocked";
  if (["staff", "admin"].includes(account.profile.role)) return "/admin";
  if (account.organisers.some((org) => org.kyc_status === "approved")) return "/console";
  if (account.organisers.length) return "/console/pending";
  return "/me";
}

function within(path: string, root: string) {
  return path === root || path.startsWith(`${root}/`);
}

// All destinations are fixed local paths. Query strings and user metadata never grant access.
export function routeRedirect(account: Account, path: string): string | null {
  const landing = landingPath(account);
  if (account.profile.blocked_at) return path === "/blocked" ? null : "/blocked";
  if (path === "/login" || path === "/blocked" || path === "/auth/complete") return landing;
  if (within(path, "/admin"))
    return ["staff", "admin"].includes(account.profile.role) ? null : landing;
  if (within(path, "/console")) {
    if (!account.organisers.length) return landing;
    const approved = account.organisers.some((org) => org.kyc_status === "approved");
    if (
      !approved &&
      path !== "/console/pending" &&
      path !== "/console/onboarding" &&
      !within(path, "/console/events")
    )
      return "/console/pending";
    if (approved && path === "/console/pending") return "/console";
  }
  return null;
}
