import type { Tables } from "@/lib/db/types";

export type EventAssignment = {
  eventId: string;
  role: "manager" | "door";
};

export type Account = {
  profile: Pick<
    Tables<"profiles">,
    "id" | "full_name" | "phone" | "role" | "blocked_at" | "block_reason"
  > &
    Partial<Pick<Tables<"profiles">, "display_name" | "avatar_path">>;
  organisers: Pick<Tables<"organisers">, "id" | "kyc_status">[];
  assignments?: EventAssignment[];
};

export function landingPath(account: Account): string {
  if (account.profile.blocked_at) return "/blocked";
  if (["staff", "admin"].includes(account.profile.role)) return "/admin";
  if (account.organisers.some((org) => org.kyc_status === "approved")) return "/console";
  if (account.organisers.length) return "/console/pending";
  const assignments = account.assignments ?? [];
  if (assignments.length === 1) return `/console/events/${assignments[0].eventId}/scan`;
  if (assignments.length > 1) return "/console/events";
  return "/me";
}

function within(path: string, root: string) {
  return path === root || path.startsWith(`${root}/`);
}

function eventLeaf(path: string, leaf: "scan" | "team") {
  const match = new RegExp(`^/console/events/([0-9a-f-]{36})/${leaf}$`, "i").exec(path);
  return match?.[1]?.toLowerCase() ?? null;
}

function eventSales(path: string) {
  const match = /^\/console\/events\/([0-9a-f-]{36})(?:\/export)?$/i.exec(path);
  return match?.[1]?.toLowerCase() ?? null;
}

// All destinations are fixed local paths. Query strings and user metadata never grant access.
export function routeRedirect(account: Account, path: string): string | null {
  const landing = landingPath(account);
  if (account.profile.blocked_at) return path === "/blocked" ? null : "/blocked";
  if (path === "/login" || path === "/blocked" || path === "/auth/complete") return landing;
  if (within(path, "/admin"))
    return ["staff", "admin"].includes(account.profile.role) ? null : landing;
  if (within(path, "/console")) {
    const assignments = account.assignments ?? [];
    if (!account.organisers.length) {
      if (["staff", "admin"].includes(account.profile.role) || !assignments.length) return landing;
      if (path === "/console/events") return null;
      const scanEvent = eventLeaf(path, "scan");
      if (scanEvent && assignments.some((item) => item.eventId === scanEvent)) return null;
      const teamEvent = eventLeaf(path, "team");
      if (
        teamEvent &&
        assignments.some((item) => item.eventId === teamEvent && item.role === "manager")
      )
        return null;
      const salesEvent = eventSales(path);
      if (
        salesEvent &&
        assignments.some((item) => item.eventId === salesEvent && item.role === "manager")
      )
        return null;
      return assignments.length === 1
        ? `/console/events/${assignments[0].eventId}/scan`
        : "/console/events";
    }
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
