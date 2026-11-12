import "server-only";

import { z } from "zod";
import { requireAccount } from "@/lib/auth/account";
import { requireStaff } from "@/lib/admin/access";
import { allowRequest } from "@/lib/security/rate-limit";
import { loadEventSales } from "./read";

const headers = { "cache-control": "no-store" };

export async function liveSalesResponse(id: string, staff = false) {
  if (!z.uuid().safeParse(id).success) return new Response(null, { status: 404, headers });
  const { client, account } = await (staff ? requireStaff() : requireAccount());
  if (!(await allowRequest("event-sales-live", account.profile.id, 300, 3600)))
    return new Response(null, { status: 429, headers });
  const sales = await loadEventSales(client, id);
  return sales ? Response.json(sales, { headers }) : new Response(null, { status: 404, headers });
}
