import { Suspense } from "react";
import { requireStaff } from "@/lib/admin/access";
import { Button } from "@/components/ui/button";
import { savePaymentSettings } from "./payment-actions";
import { Card } from "@/components/ui/card";
import { RefundPauseForm } from "@/components/refunds/pause-form";
import { loadRefundPause } from "@/lib/refunds/read";

type Props = {
  searchParams: Promise<{
    refund?: string;
    refund_error?: string;
    payment?: string;
    payment_error?: string;
  }>;
};
async function Settings({ searchParams }: Props) {
  const { account, client } = await requireStaff();
  const [pause, { data: payments, error }] = await Promise.all([
    loadRefundPause(client, null),
    client.from("platform_payment_settings").select("*").eq("id", true).single(),
  ]);
  if (error || !payments) throw new Error("Payment settings could not be loaded.");
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
      <Card className="space-y-3">
        <h2 id="payment-settings" className="text-xl font-bold">
          Payments and earnings
        </h2>
        {query.payment && <p role="status">Payment settings saved.</p>}
        {query.payment_error && (
          <p role="alert" className="text-danger">
            The payment settings could not be saved. Check the hold days and reason.
          </p>
        )}
        <form action={savePaymentSettings} className="grid gap-3">
          <label className="grid gap-1">
            Payout mode
            <select
              className="rounded-lg border border-line p-2"
              name="mode"
              defaultValue={payments.payout_mode}
            >
              <option value="manual">Manual bank transfer</option>
              <option value="gateway_split">Gateway split</option>
            </select>
          </label>
          <label className="grid gap-1">
            Gateway
            <select
              className="rounded-lg border border-line p-2"
              name="gateway"
              defaultValue={payments.active_gateway}
            >
              <option value="cashfree">Cashfree</option>
              <option value="instamojo" disabled>
                Instamojo (not configured)
              </option>
              <option value="razorpay" disabled>
                Razorpay (not configured)
              </option>
              <option value="payu" disabled>
                PayU (not configured)
              </option>
            </select>
          </label>
          <label className="grid gap-1">
            Working days after the event
            <input
              className="rounded-lg border border-line p-2"
              name="days"
              type="number"
              min={0}
              max={365}
              defaultValue={payments.payout_hold_days_after_event}
              required
            />
          </label>
          <label className="grid gap-1">
            Reason
            <input
              className="rounded-lg border border-line p-2"
              name="reason"
              maxLength={1000}
              required
            />
          </label>
          <Button type="submit">Save payment settings</Button>
        </form>
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
