import { Suspense } from "react";
import { notFound } from "next/navigation";
import { EventEditor } from "@/components/events/event-editor";
async function Editor({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  return <EventEditor id={id} searchParams={searchParams} />;
}
export default function Page(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  return (
    <Suspense fallback={<p className="p-8">Loading your saved event…</p>}>
      <Editor {...props} />
    </Suspense>
  );
}
