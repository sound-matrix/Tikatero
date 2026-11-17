import { acceptPayUNotification } from "@/lib/payments/payu-callback";
export async function POST(request: Request) {
  const result = await acceptPayUNotification(request);
  if (result.httpStatus === 200 && result.orderId) {
    return Response.redirect(new URL("/orders/" + result.orderId + "/status", request.url), 303);
  }
  if (result.httpStatus === 503 && result.orderId) {
    return Response.redirect(new URL("/orders/" + result.orderId + "/status", request.url), 303);
  }
  return new Response("Payment callback could not be verified.", { status: result.httpStatus });
}
