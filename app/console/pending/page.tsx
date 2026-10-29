import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireAccount } from "@/lib/auth/account";
async function Status() {
  const { account } = await requireAccount();
  const editing = account.organisers.some(
    (org) => org.kyc_status === "draft" || org.kyc_status === "needs_docs",
  );
  const needsDocs = account.organisers.some((org) => org.kyc_status === "needs_docs");
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
            : "We’re checking your details — usually within 1 working day."}
        </h2>
        <p className="mt-3 text-muted">
          {editing
            ? "Save your progress as you go. Our team will check your details before you can publish events."
            : "You’ll hear from us when your account is approved or if we need another document."}
        </p>
        {editing && (
          <Button className="mt-5" variant="primary" href="/console/onboarding">
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
export default function PendingPage() {
  return (
    <Suspense fallback={<p className="p-8">Loading your verification status…</p>}>
      <Status />
    </Suspense>
  );
}
