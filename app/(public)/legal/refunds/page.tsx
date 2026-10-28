import type { Metadata } from "next";
import { LegalArticle } from "@/components/layout/legal-article";

export const metadata: Metadata = { title: "Refunds" };

export default function RefundsPage() {
  return <LegalArticle slug="refunds" />;
}
