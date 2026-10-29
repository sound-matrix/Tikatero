import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { reconcile, transition } from "@/lib/checkout/store";
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
        }
      }),
    );
  return Response.json(
    { checked, failed },
    { status: failed ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
export const maxDuration = 300;
