// Shared only by server configuration/signing; no environment access in browser modules.
export function parsePublicBaseUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    /[*]/.test(url.href)
  ) {
    throw new Error("Invalid public media URL configuration.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "") + "/";
  return url;
}

/** Local Supabase is HTTP; deployed projects must use HTTPS. */
export function storagePublicBase(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/?$/.test(url.pathname) ||
      url.hostname.includes("*")
    )
      return null;
    return `${url.origin}/storage/v1/object/public/event-media/`;
  } catch {
    return null;
  }
}
