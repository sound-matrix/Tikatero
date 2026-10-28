import type { Metadata } from "next";
import { ShellPage } from "@/components/layout/shell-page";

export const metadata: Metadata = { title: "Settings" };

export default function ConsoleSettingsPage() {
  return <ShellPage title="Settings" description="Organisation settings will live on this page." />;
}
