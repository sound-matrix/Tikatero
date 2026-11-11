import Link from "next/link";
import type { LegalSlug } from "@/lib/legal";
import { legalPages } from "@/lib/legal";

export function LegalArticle({ slug }: { slug: LegalSlug }) {
  const page = legalPages[slug];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">{page.title}</h1>
      {page.paragraphs.map((paragraph) => (
        <p key={paragraph} className="mt-4 text-base leading-7 text-ink">
          {paragraph}
        </p>
      ))}
      {"support" in page ? (
        <p className="mt-4 text-base leading-7 text-ink">
          {page.support.before}{" "}
          <Link href="/contact" className="font-semibold text-teal underline underline-offset-2">
            {page.support.link}
          </Link>
          {page.support.after}
        </p>
      ) : null}
    </main>
  );
}
