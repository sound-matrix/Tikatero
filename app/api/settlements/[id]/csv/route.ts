import { requireAccount } from "@/lib/auth/account";
import { eventStatement, eventStatementCsv } from "@/lib/payouts/event-statement";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  try {
    const { client } = await requireAccount();
    const summary = await eventStatement(client, id);
    return new Response(eventStatementCsv(summary), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="tikatero-event-${id}-statement.csv"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("Statement unavailable.", { status: 403, headers: { "cache-control": "no-store" } });
  }
}
