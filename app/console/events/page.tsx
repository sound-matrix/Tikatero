import type { Metadata } from "next";
import { ShellPage } from "@/components/layout/shell-page";

export const metadata: Metadata = { title: "Events" };

export default function ConsoleEventsPage() {
  return (
    <ShellPage
      title="Events"
      description="You will create and edit events on this page. Nothing can be published from here yet."
    />
  );
}
