import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAccount } from "@/lib/auth/account";
import { Card } from "@/components/ui/card";
import { OrganisationNameForm } from "./name-form";

export const metadata: Metadata = { title: "Organisation settings" };

const statusNames: Record<string, string> = {
  approved: "Verified",
  auto_passed: "Under review",
  needs_docs: "Documents requested",
  submitted: "Submitted",
  rejected: "Verification closed",
  draft: "Not submitted",
};

async function OrganisationSettings() {
  const { client, account } = await requireAccount();
  const ids = account.organisers.map((org) => org.id);
  const { data: organisations, error } = ids.length
    ? await client
        .from("organisers")
        .select("id,display_name,slug,legal_name,country,kyc_status,owner_id,sales_paused,payouts_on_hold")
        .in("id", ids)
        .order("display_name")
    : { data: [], error: null };
  if (error) throw new Error("Organisation settings could not be loaded.");
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-8">
      <header>
        <p className="mb-2 text-sm font-bold uppercase tracking-widest text-teal">Organiser console</p>
        <h1 className="text-3xl font-extrabold">Organisation settings</h1>
        <p className="mt-2 text-muted">
          Manage your public organiser name, view verification details and access payout settings.
        </p>
      </header>

      {!organisations?.length && (
        <Card>
          <h2 className="text-xl font-bold">No organisation found</h2>
          <p className="mt-2 text-muted">Create or join an organiser account to manage its settings.</p>
          <Link href="/console/onboarding" className="mt-3 inline-block font-semibold text-teal underline">
            Organiser verification
          </Link>
        </Card>
      )}

      {organisations?.map((org) => {
        const owner = org.owner_id === account.profile.id;
        return (
          <Card key={org.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">{org.display_name}</h2>
                <p className="mt-1 text-sm text-muted">Organisation ID: {org.slug}</p>
              </div>
              <span className="rounded-full border border-line bg-soft px-3 py-1 text-sm font-bold">
                {statusNames[org.kyc_status] ?? org.kyc_status}
              </span>
            </div>

            {owner ? (
              <OrganisationNameForm organiserId={org.id} displayName={org.display_name} />
            ) : (
              <p className="mt-4 text-sm text-muted">
                Only the organisation owner can change its public name.
              </p>
            )}

            <div className="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
              <section className="rounded-xl bg-soft p-4">
                <h3 className="font-bold">Verified identity</h3>
                <dl className="mt-3 space-y-2 text-sm">
                  <div><dt className="text-muted">Legal name</dt><dd className="font-semibold">{org.legal_name ?? "Not yet provided"}</dd></div>
                  <div><dt className="text-muted">Country</dt><dd className="font-semibold">{org.country}</dd></div>
                </dl>
                <p className="mt-3 text-xs text-muted">Verified identity details cannot be changed here.</p>
                <Link href={`/console/onboarding?organiser=${org.id}`} className="mt-3 inline-block font-semibold text-teal underline">
                  Verification details
                </Link>
              </section>
              <section className="rounded-xl bg-soft p-4">
                <h3 className="font-bold">Payments and payouts</h3>
                <p className="mt-2 text-sm text-muted">
                  {org.sales_paused ? "Ticket sales are currently paused. " : ""}
                  {org.payouts_on_hold ? "Payouts are on hold. " : ""}
                  Manage your payout bank confirmation and view payment history in Your earnings.
                </p>
                <Link href="/console/payouts" className="mt-3 inline-block font-semibold text-teal underline">
                  Open earnings and payout details
                </Link>
              </section>
            </div>
          </Card>
        );
      })}
      <Card>
        <h2 className="text-xl font-bold">Your account and events</h2>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold">
          <Link href="/me" className="text-teal underline">Personal account and contact details</Link>
          <Link href="/console/events" className="text-teal underline">Manage events</Link>
          <Link href="/console/tools/team" className="text-teal underline">Event team permissions</Link>
        </div>
      </Card>
    </main>
  );
}

export default function ConsoleSettingsPage() {
  return (
    <Suspense fallback={<p className="p-8">Loading organisation settings…</p>}>
      <OrganisationSettings />
    </Suspense>
  );
}
