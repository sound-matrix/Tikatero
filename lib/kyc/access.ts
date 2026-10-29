import "server-only";
import { KycError } from "./model";
import type { Account } from "@/lib/auth/routing";
export function requireKycMembership(account: Account | null, organiserId: string) {
  if (
    !account ||
    account.profile.blocked_at ||
    !/^[0-9a-f-]{36}$/i.test(organiserId) ||
    !account.organisers.some((org) => org.id === organiserId)
  )
    throw new KycError("You don’t have permission to change this application.");
}
