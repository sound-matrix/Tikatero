import "server-only";

import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { tokenHash } from "@/lib/checkout/security";
import { verifyTicketLink } from "./qr";

function sameHash(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export async function ticketAccessAllowed(input: {
  code: string;
  token?: string;
  orderId: string;
  buyerId: string | null;
  accessTokenHash: string | null;
}) {
  if (input.token && verifyTicketLink(input.code, input.token)) return true;
  const jar = await cookies();
  const cookie =
    jar.get(`ticket_${input.orderId}`)?.value ?? jar.get(`checkout_${input.orderId}`)?.value;
  if (
    cookie &&
    cookie.length === 43 &&
    input.accessTokenHash &&
    sameHash(tokenHash(cookie), input.accessTokenHash)
  ) {
    return true;
  }
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  return Boolean(user?.email_confirmed_at && input.buyerId && user.id === input.buyerId);
}
