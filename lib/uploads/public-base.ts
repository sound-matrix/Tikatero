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
