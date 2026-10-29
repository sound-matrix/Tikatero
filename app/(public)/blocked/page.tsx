import { Suspense } from "react";
import { redirect } from "next/navigation";
import { readAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";
import { landingPath } from "@/lib/auth/routing";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { signOut } from "../me/actions";

async function Blocked() {
  const account = await readAccount(await createClient());
  if (!account) redirect("/login");
  if (!account.profile.blocked_at) redirect(landingPath(account));
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10">
      <h1 className="text-3xl font-extrabold text-ink">Your account is blocked</h1>
      <Card className="my-6">
        <p className="font-semibold">Reason</p>
        <p className="mt-2 text-muted">
          {account.profile.block_reason ||
            "Your account has been restricted. Contact support for help."}
        </p>
      </Card>
      <div className="flex gap-3">
        <Button href="/help">Get help</Button>
        <form action={signOut}>
          <Button type="submit">Sign out</Button>
        </form>
      </div>
    </main>
  );
}
export default function BlockedPage() {
  return (
    <Suspense fallback={<p className="p-8">Loading your account…</p>}>
      <Blocked />
    </Suspense>
  );
}
