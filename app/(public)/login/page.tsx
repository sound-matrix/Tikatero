import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

async function Form({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return <LoginForm linkError={params.error === "link"} />;
}

export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <p className="mb-3 text-sm font-semibold text-teal">Welcome to Tikatero</p>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Sign in</h1>
      <p className="mt-3 text-muted">One sign-in. Your account type decides where you land.</p>
      <Suspense fallback={<p className="mt-6">Loading sign-in…</p>}>
        <Form searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
