import { formatInr, formatIst } from "@/lib/format";
import { assertExportSafe } from "./model";

export type AccountExportRaw = {
  profile: {
    full_name: string | null;
    phone: string | null;
    display_name?: string | null;
    avatar_path?: string | null;
    city?: string | null;
    date_of_birth?: string | null;
    gender?: string | null;
    updated_at?: string;
  } | null;
  phones?: unknown[];
  emails?: unknown[];
  social_links?: unknown[];
  checkout_preferences?: unknown;
  consents?: unknown[];
  event_shares?: unknown[];
  orders: {
    id: string;
    event_title: string;
    status: string;
    paid_at: string | null;
    total_paise: number;
    is_test: boolean;
    ref_channel?: string | null;
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
      display_name: raw.profile?.display_name ?? null,
      avatar_path: raw.profile?.avatar_path ?? null,
      city: raw.profile?.city ?? null,
      date_of_birth: raw.profile?.date_of_birth ?? null,
      gender: raw.profile?.gender ?? null,
      updated_at: raw.profile?.updated_at ?? null,
    },
    phones: raw.phones ?? [],
    emails: raw.emails ?? [],
    social_links: raw.social_links ?? [],
    checkout_preferences: raw.checkout_preferences ?? null,
    consents: raw.consents ?? [],
    event_shares: raw.event_shares ?? [],
    orders: raw.orders.map((order) => ({
      event: order.event_title,
      ref_channel: order.ref_channel ?? null,
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
