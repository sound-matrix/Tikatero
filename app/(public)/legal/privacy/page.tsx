import type { Metadata } from "next";
import { LegalArticle } from "@/components/layout/legal-article";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return <LegalArticle slug="privacy" />;
}
