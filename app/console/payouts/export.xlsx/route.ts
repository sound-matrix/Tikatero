import { requireAccount } from "@/lib/auth/account";
import { allowRequest } from "@/lib/security/rate-limit";
import { downloadLimit } from "@/lib/payouts/excel-download";
import { loadDashboard, loadEventExcelRows } from "@/lib/payouts/read";
import { buildAllEventsWorkbook, excelResponse } from "@/lib/payouts/xlsx";

export async function GET() {
  const { client, account } = await requireAccount();
  if (!account.organisers.length) return new Response(null, { status: 404 });
  if (!(await allowRequest("export-user", account.profile.id, 10, 3600))) return downloadLimit();
  const dashboard = await loadDashboard(client);
  const events = dashboard.organisers.flatMap((org) => org.events);
  const results = [];
  for (const event of events) {
    const { payouts } = await loadEventExcelRows(client, event.id, false, false);
    results.push({ event, payouts });
  }
  return excelResponse(buildAllEventsWorkbook(results), "all-events", new Date());
}
