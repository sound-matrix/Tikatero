import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { INTERNATIONAL_PENDING } from "@/lib/kyc/model";
import { requireAccount } from "@/lib/auth/account";
async function Status({ searchParams }: { searchParams: Promise<{ organiser?: string }> }) {
  const { client, account } = await requireAccount();
  const { organiser } = await searchParams;
  const ids = account.organisers.map((org) => org.id);
  const selected = organiser && ids.includes(organiser) ? [organiser] : ids;
  const { data: intl, error } = selected.length
    ? await client
        .from("kyc_applications")
        .select("id")
        .in("organiser_id", selected)
        .eq("region", "INTL")
        .eq("status", "submitted")
        .limit(1)
    : { data: [], error: null };
  if (error) throw new Error("Verification status could not be loaded.");
  const editing = account.organisers
    .filter((org) => selected.includes(org.id))
    .some((org) => org.kyc_status === "draft" || org.kyc_status === "needs_docs");
  const needsDocs = account.organisers.some(
    (org) => selected.includes(org.id) && org.kyc_status === "needs_docs",
  );
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <p className="mb-3 font-semibold text-teal">Organiser verification</p>
      <h1 className="text-3xl font-extrabold text-ink">
        {editing
          ? needsDocs
            ? "A few details need a check"
            : "You’re on your way"
          : "Your details are with our team"}
      </h1>
      <Card className="my-6">
        <h2 className="text-xl font-bold">
          {editing
            ? "Finish your verification"
            : intl?.length
              ? INTERNATIONAL_PENDING
              : "We’re checking your details — usually within 1 working day."}
        </h2>
        <p className="mt-3 text-muted">
          {editing
            ? "Save your progress as you go. Our team will check your details before you can publish events."
            : "You’ll hear from us when your account is approved or if we need another document."}
        </p>
        {editing && (
          <Button
            className="mt-5"
            variant="primary"
            href={
              organiser && ids.includes(organiser)
                ? `/console/onboarding?organiser=${organiser}`
                : "/console/onboarding"
            }
          >
            {needsDocs ? "Check requested details" : "Start or continue verification"}
          </Button>
        )}
      </Card>
      <Card className="mb-6">
        <h2 className="text-xl font-bold">Plan your first event</h2>
        <p className="mt-3 text-muted">
          You can prepare draft events while verification is in progress. Publishing opens after
          approval.
        </p>
        <Button className="mt-5" disabled>
          🔒 Publish — approval needed
        </Button>
      </Card>
      <Button href="/me">Back to your account</Button>
    </main>
  );
}
export default function PendingPage(props: { searchParams: Promise<{ organiser?: string }> }) {
  return (
    <Suspense fallback={<p className="p-8">Loading your verification status…</p>}>
      <Status {...props} />
    </Suspense>
  );
}
