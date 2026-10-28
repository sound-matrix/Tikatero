import type { Metadata } from "next";
import { ShellPage } from "@/components/layout/shell-page";

export const metadata: Metadata = { title: "Payouts" };

export default function ConsolePayoutsPage() {
  return (
    <ShellPage
      title="Payouts"
      description="Payout amounts will show here in rupees, including GST."
    />
  );
}
