import { Suspense } from "react";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/admin/access";
import { activePricing } from "@/lib/pricing/data";
import { AdminPage } from "@/components/admin/page";
import { PricingForm } from "@/components/admin/pricing-form";
export const metadata: Metadata = { title: "Pricing" };
async function Pricing() {
  await requireStaff();
  const version = await activePricing();
  return (
    <AdminPage
      title="Pricing"
      description="Set fees for new orders. Prices include GST; previous orders keep their pricing version."
    >
      <PricingForm initial={version} />
    </AdminPage>
  );
}
export default function AdminPricingPage() {
  return (
    <Suspense fallback={<p className="p-8">Loading pricing…</p>}>
      <Pricing />
    </Suspense>
  );
}
