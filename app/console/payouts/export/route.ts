import { requireAccount } from "@/lib/auth/account";
import { hostEarnings } from "@/lib/payouts/earnings";
import { earningsHeaders, earningsRows } from "@/lib/payouts/earnings-sheet";
import { sheetCsv } from "@/lib/payouts/bank-sheet";
import { allowRequest } from "@/lib/security/rate-limit";

export async function GET() {
  const { client, account } = await requireAccount();
  if (!account.organisers.length && !account.assignments?.some((item) => item.role === "manager"))
    return new Response(null, { status: 403 });
  if (!(await allowRequest("export-user", account.profile.id, 10, 3600)))
    return new Response("Too many downloads. Please wait an hour and try again.", { status: 429 });
  const { events } = await hostEarnings(client, false);
  return new Response(sheetCsv(earningsHeaders, earningsRows(events)), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="earnings.csv"',
      "cache-control": "no-store",
    },
  });
}
