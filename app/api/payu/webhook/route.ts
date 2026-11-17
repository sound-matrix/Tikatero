import { acceptPayUNotification } from "@/lib/payments/payu-callback";
export async function POST(request: Request) {
  const result = await acceptPayUNotification(request);
  return Response.json(
    { received: result.httpStatus === 200 },
    { status: result.httpStatus, headers: { "Cache-Control": "no-store" } },
  );
}
