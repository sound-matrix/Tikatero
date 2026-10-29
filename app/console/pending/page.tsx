import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function PendingPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <p className="mb-3 font-semibold text-teal">Organiser account created</p>
      <h1 className="text-3xl font-extrabold text-ink">You’re on your way</h1>
      <Card className="my-6">
        <h2 className="text-xl font-bold">Verification is still needed</h2>
        <p className="mt-3 text-muted">
          Your organiser account is not approved yet. Once verification is complete and your account
          is approved, you’ll be able to use the organiser console.
        </p>
      </Card>
      <Button href="/me">Back to your account</Button>
    </main>
  );
}
