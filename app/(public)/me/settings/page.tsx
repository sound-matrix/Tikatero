import { Suspense } from "react";
import { requireAccount } from "@/lib/auth/account";
import { ProfileForm } from "@/components/auth/profile-form";
import { DeleteAccountForm } from "@/components/account/delete-account-form";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

async function Settings() {
  const { client, account } = await requireAccount();
  const { data } = await client.rpc("account_deletion_status");
  const status =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as { allowed?: boolean; message?: string })
      : { allowed: false, message: "" };
  return (
    <main className="mx-auto w-full max-w-lg space-y-6 px-4 py-10">
      <h1 className="text-3xl font-extrabold text-ink">Your details</h1>
      <p className="text-muted">Keep your name and phone number up to date.</p>
      <Card>
        <ProfileForm name={account.profile.full_name} phone={account.profile.phone} />
        <Button href="/me/profile" className="mt-4">
          Open my profile
        </Button>
      </Card>
      <Card>
        <h2 className="text-xl font-bold">Your data</h2>
        <p className="mt-2 text-muted">
          Download a copy of your profile, tickets, and orders. Times are in IST and prices include
          GST.
        </p>
        <Button className="mt-4" href="/me/export" variant="primary">
          Download your data
        </Button>
      </Card>
      <Card>
        <h2 className="text-xl font-bold">Delete your account</h2>
        {status.allowed ? (
          <>
            <p className="mt-2 text-muted">
              This signs you out and removes your name, phone, and email from your profile and
              bookings. Payment records we have to keep stay, without those details.
            </p>
            <div className="mt-4">
              <DeleteAccountForm />
            </div>
          </>
        ) : (
          <p className="mt-2 text-ink">{status.message}</p>
        )}
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
