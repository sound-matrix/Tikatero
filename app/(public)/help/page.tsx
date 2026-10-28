import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Help",
};

export default function HelpPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Help</h1>
      <p className="mt-4 text-base leading-7 text-ink">
        Tikatero is a product of Sound Matrix. If you need help with a booking, start here. A way to
        reach us will be added on this page.
      </p>
    </main>
  );
}
