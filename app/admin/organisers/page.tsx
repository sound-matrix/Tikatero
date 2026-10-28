import type { Metadata } from "next";
import { ShellPage } from "@/components/layout/shell-page";

export const metadata: Metadata = { title: "Organisers" };

export default function AdminOrganisersPage() {
  return (
    <ShellPage
      title="Organisers"
      description="Organiser accounts will be listed on this page for staff to review."
    />
  );
}
