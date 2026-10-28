import type { Metadata } from "next";
import { ShellPage } from "@/components/layout/shell-page";

export const metadata: Metadata = { title: "Events" };

export default function AdminEventsPage() {
  return (
    <ShellPage
      title="Events"
      description="Staff will be able to feature or unpublish an event from this page."
    />
  );
}
