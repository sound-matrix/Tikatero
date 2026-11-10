function bytesFromBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

export function keyFromBase64(value: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

/** Timing-safe check of `code.signature` with one event's derived key. */
export async function verifyEventSignature(payload: string, key: Uint8Array) {
  const dot = payload.lastIndexOf(".");
  if (dot <= 0 || key.byteLength !== 32) return false;
  const code = payload.slice(0, dot);
  const signature = bytesFromBase64Url(payload.slice(dot + 1));
  if (!code || !signature?.byteLength) return false;
  try {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(key),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return crypto.subtle.verify("HMAC", cryptoKey, signature, new TextEncoder().encode(code));
  } catch {
    return false;
  }
}
