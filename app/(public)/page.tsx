import { Suspense } from "react";
import { HomeResults } from "@/components/home/home-results";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
      <h1 className="max-w-3xl text-3xl font-extrabold leading-tight tracking-tight text-ink md:text-[34px]">
        Find events near you
      </h1>
      <p className="mt-3 max-w-2xl text-lg text-muted">
        Concerts, festivals, meetups and parties. Prices are in rupees and include GST. No hidden
        fees. What you see is what you pay.
      </p>
      <div className="mt-8">
        <Suspense
          fallback={
            <EmptyState
              title="Looking for events"
              description="The list will appear in a moment."
            />
          }
        >
          <HomeResults />
        </Suspense>
      </div>
      <Card className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Hosting an event?</h2>
          <p className="mt-1 text-muted">
            The organiser console is where you will set ticket prices. Prices include GST.
          </p>
        </div>
        <Button href="/console" variant="secondary">
          Open the organiser console
        </Button>
      </Card>
    </main>
  );
}
