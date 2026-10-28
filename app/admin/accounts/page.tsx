import type { Metadata } from "next";
import { ShellPage } from "@/components/layout/shell-page";

export const metadata: Metadata = { title: "Accounts" };

export default function AdminAccountsPage() {
  return (
    <ShellPage
      title="Accounts"
      description="Staff will be able to review accounts from this page."
    />
  );
}
