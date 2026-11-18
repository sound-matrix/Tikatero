import { metaConfigured } from "@/lib/social/meta";
import { runSocialCron } from "@/lib/social/worker";
import { cronAuthorized } from "@/lib/security/cron";

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return new Response(null, { status: 401 });
  try {
    const result = await runSocialCron();
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      {
        configured: metaConfigured(),
        enqueued: 0,
        claimed: 0,
        posted: 0,
        failed: 1,
        skipped: 0,
        waiting: 0,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const maxDuration = 300;
