import { requireAccount } from "@/lib/auth/account";
import { payoutsCsv } from "@/lib/payouts/csv";
import { allowRequest } from "@/lib/security/rate-limit";

const labels: Record<string, string> = {
  scheduled: "To be paid",
  settled: "Paid",
  failed: "Could not be paid",
  on_hold: "On hold",
};

export async function GET() {
  const { client, account } = await requireAccount();
  if (!(await allowRequest("export-user", account.profile.id, 10, 3600)))
    return new Response("Too many downloads. Please wait an hour and try again.", { status: 429 });
  const ids = new Set(account.organisers.map((org) => org.id));
  const { data, error } = await client
    .from("payouts")
    .select("organiser_id, amount_paise, status, expected_at, settled_at, is_test, events(title)")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) return new Response("Payouts could not be exported.", { status: 503 });
  const owned = (data ?? []).filter((row) => ids.has(row.organiser_id));
  const organiserId = owned[0]?.organiser_id ?? account.organisers[0]?.id ?? "";
  const chunks = [...new Set(owned.map((row) => row.organiser_id))].map((id) =>
    payoutsCsv(
      owned
        .filter((row) => row.organiser_id === id)
        .map((row) => {
          const event = Array.isArray(row.events) ? row.events[0] : row.events;
          return {
            organiserId: id,
            eventTitle: event?.title || "Event",
            status: labels[row.status] || row.status,
            amountPaise: row.amount_paise,
            expectedAt: row.expected_at,
            settledAt: row.settled_at,
            isTest: row.is_test,
          };
        }),
      id,
    ),
  );
  const body = chunks.length
    ? chunks
        .map((chunk, index) => (index === 0 ? chunk : chunk.split("\r\n").slice(1).join("\r\n")))
        .join("")
    : payoutsCsv([], organiserId);
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="payouts.csv"',
      "cache-control": "no-store",
    },
  });
}
