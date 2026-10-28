import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Sign in</h1>
      <p className="mt-3 text-muted">
        You will sign in with a code sent to your email. That step is not available yet.
      </p>
      <Card className="mt-6">
        <Input
          label="Email"
          name="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          disabled
        />
        <div className="mt-4">
          <Button variant="primary" disabled className="w-full">
            Email me a code
          </Button>
        </div>
      </Card>
    </main>
  );
}
