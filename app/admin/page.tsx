import type { Metadata } from "next";
import { ShellPage } from "@/components/layout/shell-page";

export const metadata: Metadata = { title: "Admin" };

export default function AdminHomePage() {
  return (
    <ShellPage
      title="Tikatero admin"
      description="Staff tools for reviewing organisers and events will live here."
    />
  );
}
