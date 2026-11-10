import { notFound } from "next/navigation";
import { requireAccount } from "@/lib/auth/account";
import { salesCsv } from "@/lib/payouts/csv";
import { loadEventSales } from "@/lib/payouts/read";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { client } = await requireAccount();
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
