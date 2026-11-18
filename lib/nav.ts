import type { Account } from "@/lib/auth/routing";

export const consoleNav = [
  { href: "/console", label: "Overview", description: "Your organiser dashboard" },
  { href: "/console/events", label: "Your events", description: "View and create events" },
  { href: "/console/tools/edit", label: "Edit events", description: "Posters, dates and tickets" },
  { href: "/console/tools/sales", label: "Ticket sales", description: "Bookings and refunds" },
  { href: "/console/tools/marketing", label: "Marketing", description: "Promote your events" },
  {
    href: "/console/tools/instagram",
    label: "Instagram Ticket Sales",
    description: "Turn followers into buyers",
  },
  { href: "/console/tools/team", label: "Event team", description: "Manage staff access" },
  { href: "/console/tools/scan", label: "QR ticket scanner", description: "Check in your guests" },
  { href: "/console/payouts", label: "Your earnings", description: "Payments and payouts" },
  { href: "/console/onboarding", label: "Verification", description: "Organiser verification" },
  { href: "/console/settings", label: "Settings", description: "Your organisation" },
] as const;

export function consoleNavFor(account: Pick<Account, "organisers" | "assignments">) {
  if (!account.organisers.length && (account.assignments ?? []).length)
    return (account.assignments ?? []).some((item) => item.role === "manager")
      ? ([
          { href: "/console/events", label: "My assigned events" },
          { href: "/console/tools/sales", label: "Ticket sales" },
          { href: "/console/tools/team", label: "Event team" },
          { href: "/console/tools/scan", label: "QR ticket scanner" },
          { href: "/console/payouts", label: "Your earnings" },
        ] as const)
      : ([
          { href: "/console/events", label: "My assigned events" },
          { href: "/console/tools/scan", label: "QR ticket scanner" },
        ] as const);
  return consoleNav;
}

export const adminNav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/kyc", label: "Host ID checks" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/social", label: "Social posts" },
  { href: "/admin/payouts", label: "Host payouts" },
  { href: "/admin/pricing", label: "Pricing" },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/messages", label: "Messages" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/emails/preview", label: "Email previews" },
] as const;
