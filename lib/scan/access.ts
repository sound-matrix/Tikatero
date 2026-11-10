import type { Account } from "@/lib/auth/routing";

export type EventRef = { id: string; organiserId: string };

export function assignmentFor(account: Account, eventId: string) {
  return (account.assignments ?? []).find((item) => item.eventId === eventId);
}

export function isOrganiserFor(account: Account, organiserId: string) {
  return account.organisers.some((org) => org.id === organiserId);
}

export function canScanEvent(account: Account, event: EventRef) {
  return isOrganiserFor(account, event.organiserId) || Boolean(assignmentFor(account, event.id));
}

export function canManageTeam(account: Account, event: EventRef) {
  if (isOrganiserFor(account, event.organiserId)) return true;
  return assignmentFor(account, event.id)?.role === "manager";
}

export function scanRoleLabel(account: Account, event: EventRef) {
  if (isOrganiserFor(account, event.organiserId)) return "Organiser";
  if (assignmentFor(account, event.id)?.role === "manager") return "Event manager";
  if (assignmentFor(account, event.id)?.role === "door") return "Door scanner";
  return "Team";
}
