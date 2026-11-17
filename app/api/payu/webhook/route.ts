import { acceptPayUNotification } from "@/lib/payments/payu-callback";
import { allowRequest, requestIpFrom } from "@/lib/security/rate-limit";
export async function POST(request: Request) {
  if (!(await allowRequest("webhook", requestIpFrom(request), 120, 60)))
    return new Response(null, { status: 429 });
  const result = await acceptPayUNotification(request);
  return Response.json(
    { received: result.httpStatus === 200 },
    { status: result.httpStatus, headers: { "Cache-Control": "no-store" } },
  );
}
