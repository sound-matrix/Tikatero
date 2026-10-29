import { expect, it } from "vitest";
import { formatINR, formatIST } from "./format";
it("formats integer paise with Indian grouping and GST copy", () => {
  expect(formatINR(149900)).toBe("₹1,499 incl. GST");
  expect(formatINR(149950)).toBe("₹1,499.50 incl. GST");
  expect(formatINR(149231600)).toBe("₹14,92,316 incl. GST");
  expect(formatINR(0)).toBe("₹0 incl. GST");
  expect(formatINR(-10000)).toBe("-₹100 incl. GST");
});
it("rejects fractional, infinite and unsafe paise", () => {
  for (const value of [0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    expect(() => formatINR(value)).toThrow(RangeError);
});
it("reuses the existing IST formatter across date boundaries", () => {
  expect(formatIST("2026-11-07T12:30:00Z")).toBe("7 Nov 2026, 6:00 PM IST");
  expect(formatIST("2026-11-06T18:30:00Z")).toBe("7 Nov 2026, 12:00 AM IST");
  expect(() => formatIST("invalid")).toThrow(RangeError);
});
