import type { Metadata } from "next";
import { ShellPage } from "@/components/layout/shell-page";

export const metadata: Metadata = { title: "Organiser console" };

export default function ConsoleHomePage() {
  return (
    <ShellPage
      title="Organiser console"
      description="You will set up events, see who bought tickets, and follow payouts from here."
    />
  );
}
