import { cronAuthorized } from "@/lib/security/cron";
import { runPromotionsEmailCron } from "@/lib/marketing/worker";

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return new Response(null, { status: 401 });
  try {
    const result = await runPromotionsEmailCron();
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Promotion delivery unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
export const maxDuration = 120;
