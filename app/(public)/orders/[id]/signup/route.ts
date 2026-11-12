import { NextResponse } from "next/server";
import { ownOrder } from "@/lib/checkout/security";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const order = await ownOrder((await params).id);
  if (!order || order.status !== "paid" || !order.buyer_email)
    return new Response(null, { status: 404 });
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: "/login?as=attendee", "Cache-Control": "private, no-store" },
  });
  const secure =
    (request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "")) ===
    "https";
  const options = { httpOnly: true, sameSite: "lax" as const, maxAge: 600, secure };
  response.cookies.set("tikatero_signup_email", order.buyer_email, { ...options, path: "/login" });
  response.cookies.set("tikatero_booked_order", order.id, { ...options, path: "/auth" });
  return response;
}
