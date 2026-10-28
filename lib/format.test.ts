import { describe, expect, it } from "vitest";
import { formatInr, formatIst } from "./format";

describe("formatInr", () => {
  it("formats 100000 paise as ₹1,000", () => {
    expect(formatInr(100000)).toBe("₹1,000");
  });

  it("uses Indian grouping for larger amounts", () => {
    expect(formatInr(149231600)).toBe("₹14,92,316");
  });

  it("shows leftover paise", () => {
    expect(formatInr(100050)).toBe("₹1,000.50");
    expect(formatInr(50)).toBe("₹0.50");
  });

  it("formats zero and negative amounts", () => {
    expect(formatInr(0)).toBe("₹0");
    expect(formatInr(-100000)).toBe("-₹1,000");
  });

  it("rejects amounts that are not whole paise", () => {
    expect(() => formatInr(10.5)).toThrow(RangeError);
  });
});

describe("formatIst", () => {
  it("renders 7 Nov 2026, 6:00 PM IST for the matching UTC instant", () => {
    expect(formatIst("2026-11-07T12:30:00.000Z")).toBe("7 Nov 2026, 6:00 PM IST");
    expect(formatIst(new Date("2026-11-07T12:30:00.000Z"))).toBe("7 Nov 2026, 6:00 PM IST");
  });

  it("formats morning, noon, and midnight in IST", () => {
    expect(formatIst("2026-11-07T04:30:00.000Z")).toBe("7 Nov 2026, 10:00 AM IST");
    expect(formatIst("2026-11-07T06:30:00.000Z")).toBe("7 Nov 2026, 12:00 PM IST");
    expect(formatIst("2026-11-06T18:30:00.000Z")).toBe("7 Nov 2026, 12:00 AM IST");
  });

  it("rejects an invalid date", () => {
    expect(() => formatIst("not-a-date")).toThrow(RangeError);
  });
});
