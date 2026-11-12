import { sweepAvatarCleanup } from "@/lib/account/avatar-store";
import { sweepEventRefunds } from "@/lib/refunds/event-refunds";
import { sweepDeletedEventMedia } from "@/lib/events/moderation-store";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { reconcile, transition } from "@/lib/checkout/store";
import { sweepTicketFulfilment } from "@/lib/tickets/fulfil";
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET
    ? Buffer.from(`Bearer ${process.env.CRON_SECRET}`)
    : null;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  if (!expected || expected.length !== actual.length || !timingSafeEqual(expected, actual))
    return new Response(null, { status: 401 });
  const { data, error } = await createServiceClient()
    .from("orders")
    .select("*")
    .in("status", ["created", "pending"])
    .not("payment_provider", "is", null)
    .order("reconciled_at", { ascending: true, nullsFirst: true })
    .limit(100);
  if (error) return new Response(null, { status: 503 });
  let checked = 0,
    failed = 0;
  // Bounded batches prevent one slow provider call from starving every other hold.
  for (let i = 0; i < (data ?? []).length; i += 5)
    await Promise.all(
      data!.slice(i, i + 5).map(async (order) => {
        try {
          const status = await reconcile(order);
          if (status === "pending" && Date.parse(order.hold_expires_at ?? "") <= Date.now())
            await transition(order, {
              state: "expired",
              amount: order.total_paise,
              currency: "INR",
            });
          checked++;
        } catch {
          failed++;
          // Rotate unavailable providers so they cannot starve later pending orders.
          await createServiceClient()
            .from("orders")
            .update({ reconciled_at: new Date().toISOString() })
            .eq("id", order.id);
        }
      }),
    );
  let ticketFailures = 0;
  try {
    ticketFailures = (await sweepTicketFulfilment()).failed;
  } catch {
    ticketFailures = 1;
  }
  const [eventMediaFailures, avatarFailures] = await Promise.all([
    sweepDeletedEventMedia().catch(() => 1),
    sweepAvatarCleanup().catch(() => 1),
  ]);
  const mediaFailures = eventMediaFailures + avatarFailures;
  const refundFailures = await sweepEventRefunds().catch(() => 1);
  const unsettled = failed + ticketFailures + mediaFailures + refundFailures;
  return Response.json(
    { checked, failed, ticketFailures, mediaFailures, refundFailures },
    { status: unsettled ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
export const maxDuration = 300;
