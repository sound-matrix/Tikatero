export const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Five Crockford characters from the low 5 bits of each byte. 32 is a power of two. */
export function prefixFromBytes(bytes: Uint8Array): string {
  if (bytes.length < 5) throw new Error("Ticket code needs 5 random bytes.");
  let prefix = "";
  for (let index = 0; index < 5; index += 1) {
    prefix += CROCKFORD_ALPHABET[bytes[index] & 31];
  }
  return prefix;
}

export function ticketCode(prefix: string, seq: number): string {
  if (!new RegExp(`^[${CROCKFORD_ALPHABET}]{5}$`).test(prefix)) {
    throw new Error("Invalid ticket code.");
  }
  if (!Number.isInteger(seq) || seq < 1 || seq > 99) throw new Error("Invalid ticket code.");
  return `TK-${prefix}-${String(seq).padStart(2, "0")}`;
}

/** Public code shape, including older codes that used letters Crockford omits. */
export function isTicketCode(code: string): boolean {
  return /^TK-[A-Z0-9]{5}-[0-9]{2}$/.test(code);
}
