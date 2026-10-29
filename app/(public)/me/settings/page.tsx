import { Suspense } from "react";
import { requireAccount } from "@/lib/auth/account";
import { ProfileForm } from "@/components/auth/profile-form";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

async function Settings() {
  const { account } = await requireAccount();
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10">
      <h1 className="text-3xl font-extrabold text-ink">Your details</h1>
      <p className="mt-3 text-muted">Keep your name and phone number up to date.</p>
      <Card className="my-6">
        <ProfileForm name={account.profile.full_name} phone={account.profile.phone} />
      </Card>
      <Button href="/me">Back to your account</Button>
    </main>
  );
}
export default function SettingsPage() {
  return (
    <Suspense fallback={<p className="p-8">Loading your details…</p>}>
      <Settings />
    </Suspense>
  );
}
