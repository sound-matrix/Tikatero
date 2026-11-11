import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireAccount } from "@/lib/auth/account";
import { RefundDeskView } from "@/components/refunds/refund-desk";
import { loadRefundDesk } from "@/lib/refunds/desk";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Event refunds" };

async function StaffRefunds({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ refund?: string; refund_error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { client, account } = await requireAccount();
  if (!["staff", "admin"].includes(account.profile.role)) notFound();
  const desk = await loadRefundDesk(client, id);
  if (!desk) notFound();
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <p className="text-sm font-bold uppercase tracking-widest text-teal">Staff refunds</p>
      <h1 className="text-3xl font-extrabold text-ink">{desk.title}</h1>
      <RefundDeskView
        desk={desk}
        asStaff
        notice={query.refund === "updated" ? "The refund has been updated." : undefined}
        error={query.refund_error}
      />
      <Button href="/admin/events">All events</Button>
    </main>
  );
}

export default function Page(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ refund?: string; refund_error?: string }>;
}) {
  return (
    <Suspense fallback={<p className="p-8">Loading refunds…</p>}>
      <StaffRefunds {...props} />
    </Suspense>
  );
}
