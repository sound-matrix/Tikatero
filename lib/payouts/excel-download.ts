import "server-only";

import { z } from "zod";
import { requireAccount } from "@/lib/auth/account";
import { requireStaff } from "@/lib/admin/access";
import { allowRequest } from "@/lib/security/rate-limit";
import { loadEventExcelRows, loadEventSales } from "./read";
import { buildEventWorkbook, excelResponse } from "./xlsx";

export function downloadLimit() {
  return new Response("Too many downloads. Please wait an hour and try again.", {
    status: 429,
    headers: { "cache-control": "no-store" },
  });
}

export async function downloadEventExcel(id: string, staff: boolean) {
  if (!z.uuid().safeParse(id).success) return new Response(null, { status: 404 });
  const { client, account } = await (staff ? requireStaff() : requireAccount());
  if (!(await allowRequest("export-user", account.profile.id, 10, 3600))) return downloadLimit();
  const event = await loadEventSales(client, id);
  if (!event) return new Response(null, { status: 404 });
  const rows = await loadEventExcelRows(client, id, staff);
  const now = new Date();
  return excelResponse(buildEventWorkbook(event, rows, now), event.title, now);
}
