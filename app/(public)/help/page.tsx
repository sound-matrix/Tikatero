import type { Metadata } from "next";
import { helpParagraphs } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Help",
};

export default function HelpPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Help</h1>
      {helpParagraphs.map((paragraph) => (
        <p key={paragraph} className="mt-4 text-base leading-7 text-ink">
          {paragraph}
        </p>
      ))}
    </main>
  );
}
