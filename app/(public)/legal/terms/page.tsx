import { Suspense } from "react";
import { publicPayoutHoldDays } from "@/lib/payments/settings";
import { earningsPaymentCopy } from "@/lib/payouts/earnings";
import type { Metadata } from "next";
import { LegalArticle } from "@/components/layout/legal-article";

export const metadata: Metadata = { title: "Terms" };

async function Terms() {
  const days = await publicPayoutHoldDays().catch(() => null);
  const hostPayment =
    days === null
      ? "Sound Matrix collects ticket payments for organisers and transfers their earnings to the bank account they verified."
      : earningsPaymentCopy(days);
  return <LegalArticle slug="terms" extra={hostPayment} />;
}
export default function TermsPage() {
  return (
    <Suspense fallback={<LegalArticle slug="terms" />}>
      <Terms />
    </Suspense>
  );
}
