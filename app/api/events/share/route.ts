import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { publicEvent } from "@/lib/discovery/data";
import { sameRequestOrigin } from "@/lib/security/request-origin";
import { allowRequest, requestIpFrom } from "@/lib/security/rate-limit";
import { refCookie, shareChannel } from "@/lib/sharing/links";

const input = z.object({
  slug: z
    .string()
    .max(160)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  channel: z.string().max(16),
  type: z.enum(["share", "visit"]),
});

export async function POST(request: Request) {
  if (!sameRequestOrigin(request)) return new Response(null, { status: 403 });
  const size = Number(request.headers.get("content-length"));
  if (!size || size > 1024) return new Response(null, { status: 400 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  const channel = shareChannel(parsed.data?.channel);
  if (!parsed.success || !channel) return new Response(null, { status: 400 });
  const { slug, type } = parsed.data;
  const ip = requestIpFrom(request);
  if (!(await allowRequest(`event-${type}`, ip, 100, 600)))
    return new Response(null, { status: 429 });
  const event = await publicEvent(slug);
  if (!event) return new Response(null, { status: 404 });
  const client = createServiceClient();
  const response = new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
  if (type === "share") {
    const session = await sessionClient();
    const auth = session ? await session.auth.getUser() : null;
    const { error } = await client.from("event_shares").insert({
      event_id: event.id,
      channel,
      user_id: auth?.data.user?.id ?? null,
    });
    return error ? new Response(null, { status: 503 }) : response;
  }

  const stored = (await cookies()).get("tikatero_share_visitor")?.value;
  const visitor =
    stored && /^[a-f0-9]{32}$/.test(stored) ? stored : randomBytes(16).toString("hex");
  const day = new Date().toISOString().slice(0, 10);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const visitor_hash = createHmac("sha256", key)
    .update(`event-ref\n${day}\n${event.id}\n${visitor}`)
    .digest("hex");
  const { error } = await client.from("event_ref_visits").upsert(
    { event_id: event.id, channel, visitor_hash },
    {
      onConflict: "event_id,channel,visitor_hash",
      ignoreDuplicates: true,
    },
  );
  if (error) return new Response(null, { status: 503 });
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: request.headers.get("origin")?.startsWith("https://") ?? false,
    maxAge: 86400,
  };
  response.cookies.set("tikatero_share_visitor", visitor, { ...options, path: "/" });
  response.cookies.set(refCookie(slug), channel, { ...options, path: `/e/${slug}` });
  return response;
}
