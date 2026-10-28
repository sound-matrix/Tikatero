import { Suspense } from "react";
import type { Metadata } from "next";
import { StyleguideView } from "@/components/styleguide/styleguide-view";

export const metadata: Metadata = {
  title: "Design system",
};

export default function StyleguidePage() {
  return (
    <main className="mx-auto w-full max-w-6xl bg-white px-4 py-8 md:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink md:text-[34px]">
        Design system
      </h1>
      <p className="mt-3 max-w-2xl text-lg text-muted">
        Shared pieces for the public site, the organiser console, and Tikatero admin. Times on
        screen use India Standard Time.
      </p>
      <div className="mt-10">
        <Suspense fallback={<p className="text-muted">Loading the design system…</p>}>
          <StyleguideView />
        </Suspense>
      </div>
    </main>
  );
}
