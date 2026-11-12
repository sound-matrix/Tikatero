export function sameRequestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site") return false;
  try {
    const url = new URL(request.url);
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
    const protocol = request.headers.get("x-forwarded-proto") ?? url.protocol.slice(0, -1);
    return origin === new URL(`${protocol}://${host}`).origin;
  } catch {
    return false;
  }
}
