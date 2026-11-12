const origin = "https://tikatero.invalid";

export function returnPath(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\s\u0000-\u001f\u007f]/u.test(value)
  )
    return null;
  const url = new URL(value, origin);
  if (
    url.origin !== origin ||
    url.pathname.startsWith("//") ||
    /^\/(?:api|auth|login|blocked)(?:\/|$)/i.test(url.pathname) ||
    /%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(url.pathname)
  )
    return null;
  return url.pathname + url.search + url.hash;
}

export function withReturnPath(path: string, value: unknown) {
  const next = returnPath(value);
  return next ? `${path}${path.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}` : path;
}

export function signOutPath(value: unknown) {
  const next = returnPath(value);
  return next && !/^\/(?:me|admin|console)(?:\/|[?#]|$)/i.test(next) ? next : "/";
}
