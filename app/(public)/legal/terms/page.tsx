import type { Metadata } from "next";
import { LegalArticle } from "@/components/layout/legal-article";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return <LegalArticle slug="terms" />;
}
