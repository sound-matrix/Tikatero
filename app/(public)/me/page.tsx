import { Suspense } from "react";
import { requireAccount } from "@/lib/auth/account";
import { landingPath } from "@/lib/auth/routing";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OrganiserForm } from "@/components/auth/organiser-form";
import { signOut } from "./actions";

async function AccountContent() {
  const { account } = await requireAccount();
  const destination = landingPath(account);
  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-extrabold text-ink">Your account</h1>
      <p className="text-muted">
        Welcome{account.profile.full_name ? `, ${account.profile.full_name}` : " to Tikatero"}.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button href="/me/settings">Edit your details</Button>
        {destination !== "/me" && (
          <Button href={destination} variant="primary">
            {destination === "/admin" ? "Open Tikatero admin" : "Open organiser console"}
          </Button>
        )}
      </div>
      {destination === "/me" && (
        <Card>
          <h2 className="text-xl font-bold">Bring people together</h2>
          <p className="mt-2 text-muted">
            Create an organiser account. Your account starts as a draft while you get ready for
            verification.
          </p>
          <OrganiserForm />
        </Card>
      )}
      <form action={signOut}>
        <Button type="submit">Sign out</Button>
      </form>
    </main>
  );
}
export default function MePage() {
  return (
    <Suspense fallback={<p className="p-8">Loading your account…</p>}>
      <AccountContent />
    </Suspense>
  );
}
