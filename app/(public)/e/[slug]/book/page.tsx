import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { bookingPath, shareChannel } from "@/lib/sharing/links";
import { publicEvent } from "@/lib/discovery/data";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  if (!(await publicEvent((await params).slug))) notFound();
  return { title: "Checkout", robots: { index: false, follow: false } };
}
type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tier?: string; ref?: string }>;
};
async function Booking({ params, searchParams }: Props) {
  await connection();
  const { slug } = await params;
  if (!(await publicEvent(slug))) notFound();
  const { tier, ref } = await searchParams;
  return redirect(
    bookingPath(
      slug,
      "checkout",
      typeof tier === "string" && /^[0-9a-f-]{36}$/i.test(tier) ? tier : undefined,
      shareChannel(ref),
    ),
  );
}
export default function BookPage(props: Props) {
  return (
    <Suspense fallback={<p className="p-8">Loading checkout…</p>}>
      <Booking {...props} />
    </Suspense>
  );
}
