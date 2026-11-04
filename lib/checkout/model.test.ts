import { expect, it } from "vitest";
import { checkoutSchema } from "./model";
const input = {
  slug: "music-night",
  quotedTotal: 100000,
  pricingVersionId: "11000000-0000-4000-8000-000000000010",
  name: "Test Buyer",
  email: "buyer@example.test",
  phone: "9876543210",
  consent: true,
  lines: [{ id: "11000000-0000-4000-8000-000000000001", qty: 1 }],
};
it("rejects duplicated tiers, invalid quantities and missing consent", () => {
  expect(
    checkoutSchema.safeParse({ ...input, lines: [...input.lines, ...input.lines] }).success,
  ).toBe(false);
  expect(
    checkoutSchema.safeParse({ ...input, lines: [{ ...input.lines[0], qty: 1.5 }] }).success,
  ).toBe(false);
  expect(checkoutSchema.safeParse({ ...input, consent: false }).success).toBe(false);
});
it("strips client supplied prices and totals", () => {
  const result = checkoutSchema.parse({
    ...input,
    total: 1,
    lines: [{ ...input.lines[0], price_paise: 1 }],
  });
  expect(result.lines[0]).toEqual(input.lines[0]);
  expect(result).not.toHaveProperty("total");
});
