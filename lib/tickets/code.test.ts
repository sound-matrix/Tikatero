import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { CROCKFORD_ALPHABET, isTicketCode, prefixFromBytes, ticketCode } from "./code";

it("builds an unbiased Crockford prefix from the low 5 bits", () => {
  expect(prefixFromBytes(Uint8Array.from([0, 1, 31, 32, 33]))).toBe("01Z01");
  expect(CROCKFORD_ALPHABET).toHaveLength(32);
  expect(CROCKFORD_ALPHABET).not.toMatch(/[ILOU]/);
  for (let byte = 0; byte < 256; byte += 1) {
    expect(CROCKFORD_ALPHABET).toContain(prefixFromBytes(Uint8Array.from([byte, 0, 0, 0, 0]))[0]);
  }
});

it("formats TK-XXXXX-NN and rejects a bad prefix or seat", () => {
  expect(ticketCode("01Z01", 1)).toBe("TK-01Z01-01");
  expect(ticketCode("01Z01", 12)).toBe("TK-01Z01-12");
  expect(isTicketCode("TK-01Z01-01")).toBe(true);
  expect(isTicketCode("TK-DIW01-01")).toBe(true);
  expect(isTicketCode("tk-01Z01-01")).toBe(false);
  expect(() => ticketCode("ILOUX", 1)).toThrow(/Invalid ticket code/);
  expect(() => ticketCode("01Z01", 0)).toThrow(/Invalid ticket code/);
  expect(() => ticketCode("01Z01", 100)).toThrow(/Invalid ticket code/);
  expect(() => prefixFromBytes(Uint8Array.from([1, 2, 3]))).toThrow(/5 random bytes/);
});

it("uses the same alphabet as the database issuer", () => {
  const sql = readFileSync("supabase/migrations/20261104120000_issue_tickets.sql", "utf8");
  expect(sql).toContain(CROCKFORD_ALPHABET);
  expect(sql).toContain("qr_secret");
  expect(sql).toContain("'v1'");
});
