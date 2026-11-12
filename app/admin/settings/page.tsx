import { Suspense } from "react";
import { requireStaff } from "@/lib/admin/access";
import { Card } from "@/components/ui/card";
import { RefundPauseForm } from "@/components/refunds/pause-form";
import { loadRefundPause } from "@/lib/refunds/read";

type Props = { searchParams: Promise<{ refund?: string; refund_error?: string }> };
async function Settings({ searchParams }: Props) {
  const { account, client } = await requireStaff();
  const pause = await loadRefundPause(client, null);
  const query = await searchParams;
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-8" id="refund-settings">
      <h1 className="text-3xl font-extrabold">Settings</h1>
      <Card className="space-y-3">
        <h2 className="text-xl font-bold">Refunds across Tikatero</h2>
        <p>{pause.site_paused ? "Refunds are paused." : "Refunds are open."}</p>
        {query.refund && <p role="status">Refund settings saved.</p>}
        {query.refund_error && (
          <p role="alert" className="text-danger">
            {query.refund_error}
          </p>
        )}
        {account.profile.role === "admin" && <RefundPauseForm paused={pause.site_paused} />}
      </Card>
    </main>
  );
}

export default function Page(props: Props) {
  return (
    <Suspense fallback={<p className="p-8">Loading settings…</p>}>
      <Settings {...props} />
    </Suspense>
  );
}
