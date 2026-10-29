import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { publicEvent } from "@/lib/discovery/data";
async function Booking({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  if (!(await publicEvent(slug))) notFound();
  return redirect(`/e/${encodeURIComponent(slug)}/checkout`);
}
export default function BookPage(props: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<p className="p-8">Loading checkout…</p>}>
      <Booking {...props} />
    </Suspense>
  );
}
