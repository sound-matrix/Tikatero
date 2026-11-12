import type { Account } from "@/lib/auth/routing";

export const consoleNav = [
  { href: "/console/onboarding", label: "Verification" },
  { href: "/console", label: "Overview" },
  { href: "/console/events", label: "Events" },
  { href: "/console/payouts", label: "Your earnings" },
  { href: "/console/settings", label: "Settings" },
] as const;

export function consoleNavFor(account: Pick<Account, "organisers" | "assignments">) {
  if (!account.organisers.length && (account.assignments ?? []).length)
    return (account.assignments ?? []).some((item) => item.role === "manager")
      ? ([
          { href: "/console/events", label: "Events" },
          { href: "/console/payouts", label: "Your earnings" },
        ] as const)
      : ([{ href: "/console/events", label: "Check-in" }] as const);
  return consoleNav;
}

export const adminNav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/kyc", label: "Host ID checks" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/payouts", label: "Host payouts" },
  { href: "/admin/pricing", label: "Pricing" },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/messages", label: "Messages" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/emails/preview", label: "Email previews" },
] as const;
