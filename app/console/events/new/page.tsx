import { Suspense } from "react";
import { EventEditor } from "@/components/events/event-editor";
export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ organiser?: string; step?: string }>;
}) {
  return (
    <Suspense fallback={<p className="p-8">Loading your event wizard…</p>}>
      <EventEditor searchParams={searchParams} />
    </Suspense>
  );
}
