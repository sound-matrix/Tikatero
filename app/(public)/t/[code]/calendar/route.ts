import { calendarIcs } from "@/lib/tickets/present";
import { loadTicket } from "@/lib/tickets/load";

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const token = new URL(request.url).searchParams.get("t") ?? undefined;
  const ticket = await loadTicket(code, token);
  if (!ticket) return new Response(null, { status: 404 });
  return new Response(calendarIcs(ticket.facts), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ticket.facts.code}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
