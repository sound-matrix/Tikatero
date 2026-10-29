import { redirect } from "next/navigation";
import { requireAccount } from "@/lib/auth/account";
import { landingPath } from "@/lib/auth/routing";

// Recheck inside the server render too. Proxy additionally restricts pending
// organisers to /console/pending on every request, including RSC requests.
export async function SurfaceGuard({
  surface,
  children,
}: {
  surface: "admin" | "console";
  children: React.ReactNode;
}) {
  const { account } = await requireAccount();
  if (surface === "admin" && !["staff", "admin"].includes(account.profile.role))
    redirect(landingPath(account));
  if (surface === "console" && !account.organisers.length) redirect(landingPath(account));
  return children;
}
