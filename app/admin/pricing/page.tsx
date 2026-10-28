import type { Metadata } from "next";
import { ShellPage } from "@/components/layout/shell-page";

export const metadata: Metadata = { title: "Pricing" };

export default function AdminPricingPage() {
  return (
    <ShellPage
      title="Pricing"
      description="Ticket fees will be set here. Amounts are in rupees and include GST."
    />
  );
}
