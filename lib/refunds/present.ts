import { formatInr, formatIst } from "@/lib/format";
import { assertExportSafe } from "./model";

export type AccountExportRaw = {
  profile: { full_name: string | null; phone: string | null } | null;
  orders: {
    id: string;
    event_title: string;
    status: string;
    paid_at: string | null;
    total_paise: number;
    is_test: boolean;
  }[];
  tickets: {
    code: string;
    event_title: string;
    status: string;
    starts_at: string;
    is_test: boolean;
  }[];
  refunds: {
    id: string;
    order_id: string;
    amount_paise: number;
    status: string;
    created_at: string;
  }[];
};

export function presentAccountExport(raw: AccountExportRaw) {
  const presented = {
    profile: {
      name: raw.profile?.full_name ?? "",
      phone: raw.profile?.phone ?? "",
    },
    orders: raw.orders.map((order) => ({
      event: order.event_title,
      status: order.status,
      paid_at_ist: order.paid_at ? formatIst(order.paid_at) : null,
      total: `${formatInr(order.total_paise)} incl. GST`,
      test: order.is_test ? "Test booking. No money was sent to a bank." : "",
    })),
    tickets: raw.tickets.map((ticket) => ({
      code: ticket.code,
      event: ticket.event_title,
      status: ticket.status,
      starts_at_ist: formatIst(ticket.starts_at),
      test: ticket.is_test ? "Test ticket" : "",
    })),
    refunds: raw.refunds.map((refund) => ({
      order_id: refund.order_id,
      status: refund.status,
      amount: `${formatInr(refund.amount_paise)} incl. GST`,
      requested_at_ist: formatIst(refund.created_at),
    })),
  };
  assertExportSafe(presented);
  return presented;
}
