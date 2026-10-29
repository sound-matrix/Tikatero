import "server-only";
import { redirect } from "next/navigation";
import { requireAccount } from "@/lib/auth/account";
import { landingPath } from "@/lib/auth/routing";
export async function requireStaff() {
  const result = await requireAccount();
  if (!["staff", "admin"].includes(result.account.profile.role))
    redirect(landingPath(result.account));
  return result;
}
