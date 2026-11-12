import { Button } from "@/components/ui/button";

export default function EventUnavailable() {
  return (
    <main className="mx-auto max-w-xl space-y-5 px-4 py-14 text-center">
      <h1 className="text-2xl font-extrabold">This event isn&apos;t available right now</h1>
      <Button href="/events" variant="primary">
        Explore events
      </Button>
    </main>
  );
}
