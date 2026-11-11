import { Suspense } from "react";
import type { Metadata } from "next";
import { ContactForm } from "@/components/contact/contact-form";
import { connection } from "next/server";
import { recaptchaSiteKey } from "@/lib/security/recaptcha";

export const metadata: Metadata = {
  title: "Contact us",
  description: "Send us a message and our team will reply to your email.",
};

async function ContactBody() {
  await connection();
  return <ContactForm siteKey={recaptchaSiteKey()} />;
}

export default function ContactPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 md:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Contact us</h1>
      <p className="mt-4 text-base leading-7 text-ink">
        Send us a message and our team will reply to your email, usually within 1–2 working days.
      </p>
      <Suspense fallback={<p className="mt-8">Loading the form…</p>}>
        <ContactBody />
      </Suspense>
    </main>
  );
}
