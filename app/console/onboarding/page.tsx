import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireAccount } from "@/lib/auth/account";
import { landingPath } from "@/lib/auth/routing";
import { loadApplication } from "@/lib/kyc/store";
import { kycProvider } from "@/lib/kyc";
import { Onboarding } from "@/components/kyc/onboarding";
import { Button } from "@/components/ui/button";
async function Flow({ searchParams }: { searchParams: Promise<{ organiser?: string }> }) {
  const { client, account } = await requireAccount();
  const params = await searchParams;
  if (!account.organisers.length) redirect(landingPath(account));
  const org =
    account.organisers.find((org) => org.id === params.organiser) ?? account.organisers[0];
  if (["approved", "rejected"].includes(org.kyc_status))
    return (
      <main className="p-8">
        <h1 className="text-3xl font-bold">
          Verification {org.kyc_status === "approved" ? "complete" : "closed"}
        </h1>
        <p className="my-4">Please contact support if you need to change your details.</p>
        <Button href="/me">Your account</Button>
      </main>
    );
  const { data: organiser } = await client
    .from("organisers")
    .select("display_name")
    .eq("id", org.id)
    .single();
  return (
    <Onboarding
      key={org.id}
      initial={{
        organiserId: org.id,
        displayName: organiser?.display_name ?? "",
        mode: kycProvider().mode,
        application: await loadApplication(client, org.id),
      }}
    />
  );
}
export default function OnboardingPage(props: { searchParams: Promise<{ organiser?: string }> }) {
  return (
    <Suspense fallback={<p className="p-8">Loading your saved details…</p>}>
      <Flow {...props} />
    </Suspense>
  );
}
