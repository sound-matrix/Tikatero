import type { Metadata } from "next";
import { openAdminEvent } from "@/lib/refunds/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = { title: "Events" };

export default function AdminEventsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Events</h1>
      <p className="mt-3 text-muted">
        Open an event to review refunds. Featuring and unpublishing events comes later.
      </p>
      <form action={openAdminEvent} className="mt-6 max-w-lg space-y-4">
        <Input label="Event id" name="event_id" required />
        <Button type="submit" variant="primary">
          Open refunds
        </Button>
      </form>
    </main>
  );
}
