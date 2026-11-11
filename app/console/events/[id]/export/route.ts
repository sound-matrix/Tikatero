import { notFound } from "next/navigation";
import { requireAccount } from "@/lib/auth/account";
import { salesCsv } from "@/lib/payouts/csv";
import { loadEventSales } from "@/lib/payouts/read";
import { allowRequest } from "@/lib/security/rate-limit";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { client, account } = await requireAccount();
  if (!(await allowRequest("export-user", account.profile.id, 10, 3600)))
    return new Response("Too many downloads. Please wait an hour and try again.", { status: 429 });
  const sales = await loadEventSales(client, id);
  if (!sales) notFound();
  const body = salesCsv(
    sales.orders.map((order) => ({
      organiserId: sales.organiser_id,
      eventTitle: sales.title,
      orderId: order.id,
      paidAt: order.paid_at,
      subtotalPaise: order.subtotal_paise,
      platformFeePaise: order.platform_fee_paise,
      platformFeeGstPaise: order.platform_fee_gst_paise,
      gatewayFeePaise: order.gateway_fee_paise,
      organiserSharePaise: order.organiser_share_paise,
      buyerTotalPaise: order.buyer_total_paise,
    })),
    sales.organiser_id,
  );
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="event-sales.csv"',
      "cache-control": "no-store",
    },
  });
}
