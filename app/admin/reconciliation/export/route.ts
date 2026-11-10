import { requireStaff } from "@/lib/admin/access";
import { staffSalesCsv } from "@/lib/payouts/csv";

export async function GET() {
  const { client } = await requireStaff();
  const { data, error } = await client.rpc("admin_gateway_reconciliation");
  if (error) return new Response("Gateway costs could not be exported.", { status: 503 });
  const body = staffSalesCsv(
    (data ?? []).map((row) => ({
      eventTitle: row.event_title,
      orderId: row.order_id,
      paidAt: row.paid_at,
      organiserSharePaise: row.organiser_share_paise,
      platformSharePaise: row.platform_share_paise,
      gatewayFeePaise: row.gateway_fee_paise,
      absorbedGatewayPaise: row.absorbed_gateway_paise,
      platformNetPaise: row.platform_net_paise,
      buyerTotalPaise: row.buyer_total_paise,
    })),
  );
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="gateway-costs.csv"',
      "cache-control": "no-store",
    },
  });
}
