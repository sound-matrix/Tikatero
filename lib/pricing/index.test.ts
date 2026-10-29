import { expect, it } from "vitest";
import { computePricing, launchPricing, organiserFeeWording, previewPricing, rateText } from ".";
import { parseHundredths, parseSettings } from "./settings";

it.each([
  [29900, 28092],
  [100000, 95339],
  [499900, 478958],
])("organiser absorbs on %i paise → %i paise", (price, payout) => {
  expect(
    previewPricing({ ticketPaise: price, feePayer: "organiser" }, launchPricing),
  ).toMatchObject({ buyerTotalPaise: price, organiserPayoutPaise: payout });
});
it("passes inclusive fees to the buyer while paying the full ticket price to the organiser", () => {
  expect(previewPricing({ ticketPaise: 100000, feePayer: "buyer" }, launchPricing)).toEqual({
    ticketPaise: 100000,
    platformFeePaise: 2000,
    feeGstPaise: 360,
    gatewayFeePaise: 2301,
    buyerTotalPaise: 104661,
    organiserPayoutPaise: 100000,
  });
});
it("rounds half-up per component per ticket before multiplying quantity", () => {
  const version = {
    ...launchPricing,
    platform_pct: 5000,
    fixed_fee_paise: 0,
    gst_bps: 5000,
    gateway_bps: 5000,
  };
  const result = computePricing({
    lines: [{ price_paise: 1, qty: 3 }],
    version,
    fee_payer: "buyer",
    is_free: false,
  });
  expect(result.total).toEqual({
    subtotal: 3,
    platform_fee: 3,
    platform_fee_gst: 3,
    gateway_fee: 6,
    buyer_total: 15,
    organiser_share: 3,
    platform_share: 6,
  });
  expect(result.lines[0]).toMatchObject(result.total);
});
it("waives every fee for free events, free tiers and zero quantities", () => {
  for (const fee_payer of ["organiser", "buyer"] as const) {
    for (const [is_free, price_paise, qty] of [
      [true, 100000, 10],
      [false, 0, 10],
      [false, 100000, 0],
    ] as const) {
      const { total } = computePricing({
        lines: [{ price_paise, qty }],
        version: launchPricing,
        fee_payer,
        is_free,
      });
      expect(Object.values(total)).toEqual(Array(7).fill(0));
    }
  }
});
it("charges no gateway fees when absorbed or its rate is zero", () => {
  for (const version of [
    { ...launchPricing, gateway_mode: "absorb" as const },
    { ...launchPricing, gateway_bps: 0 },
  ])
    expect(previewPricing({ ticketPaise: 100000, feePayer: "organiser" }, version)).toMatchObject({
      gatewayFeePaise: 0,
      organiserPayoutPaise: 97640,
    });
});
it("conserves money for 4,000 reproducible random baskets and configurations", () => {
  let seed = 0x10abcd;
  const random = (max: number) => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) % max;
  };
  for (let i = 0; i < 4000; i++) {
    const version = {
      ...launchPricing,
      platform_pct: random(10001),
      fixed_fee_paise: random(100000),
      gst_bps: random(10001),
      gateway_bps: random(10001),
      gateway_mode: random(2) ? ("absorb" as const) : ("pass_at_cost" as const),
    };
    const fee_payer = random(2) ? "buyer" : "organiser";
    const is_free = random(10) === 0;
    const lines = Array.from({ length: random(8) }, () => ({
      price_paise: random(10000000),
      qty: random(20),
    }));
    const result = computePricing({ lines, version, fee_payer, is_free });
    for (const value of [...result.lines, result.total]) {
      expect(value.buyer_total).toBe(
        value.organiser_share + value.platform_share + value.gateway_fee,
      );
      expect(value.platform_share).toBe(value.platform_fee + value.platform_fee_gst);
      for (const amount of Object.values(value)) expect(Number.isSafeInteger(amount)).toBe(true);
      if (fee_payer === "buyer") expect(value.organiser_share).toBe(value.subtotal);
    }
    for (const key of Object.keys(result.total) as (keyof typeof result.total)[])
      expect(result.total[key]).toBe(result.lines.reduce((sum, line) => sum + line[key], 0));
  }
});
it("rejects fractional/negative/unsafe inputs and overflow without float money arithmetic", () => {
  for (const price of [1.5, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    expect(() =>
      previewPricing({ ticketPaise: price, feePayer: "buyer" }, launchPricing),
    ).toThrow();
  expect(() =>
    computePricing({
      lines: [{ price_paise: 1, qty: -1 }],
      version: launchPricing,
      fee_payer: "buyer",
      is_free: false,
    }),
  ).toThrow();
  expect(() =>
    previewPricing({ ticketPaise: Number.MAX_SAFE_INTEGER, feePayer: "buyer" }, launchPricing),
  ).toThrow(/safe integer/);
  expect(() =>
    previewPricing(
      { ticketPaise: 100000, feePayer: "buyer" },
      { ...launchPricing, gateway_bps: 10001 },
    ),
  ).toThrow();
});
it("builds public wording and previews from the selected version, retaining the previous calculation", () => {
  const old = previewPricing({ ticketPaise: 100000, feePayer: "organiser" }, launchPricing);
  const next = {
    ...launchPricing,
    id: "next",
    platform_pct: 200,
    fixed_fee_paise: 1000,
    gateway_mode: "absorb" as const,
  };
  expect(organiserFeeWording(launchPricing)).toContain("1.5% + ₹ 5 + 18% GST");
  expect(organiserFeeWording(launchPricing)).toContain("₹ 953.39");
  expect(organiserFeeWording(next)).toContain("2% + ₹ 10 + 18% GST, payment gateway absorbed");
  expect(
    previewPricing({ ticketPaise: 100000, feePayer: "organiser" }, next).organiserPayoutPaise,
  ).toBe(96460);
  expect(old.organiserPayoutPaise).toBe(95339);
  expect(
    computePricing({ lines: [], version: next, fee_payer: "buyer", is_free: false })
      .pricing_version_id,
  ).toBe("next");
});
it("parses settings exactly in paise and basis points", () => {
  expect(parseHundredths("1.95")).toBe(195);
  expect(parseHundredths("5")).toBe(500);
  expect(parseHundredths("0.05")).toBe(5);
  expect(rateText(10000)).toBe("100");
  expect(rateText(0)).toBe("0");
  for (const text of ["1.999", "1e3", "-1", "NaN", "", "Infinity"])
    expect(() => parseHundredths(text)).toThrow();
  const fields = {
    platform_pct: "1.50",
    fixed_fee: "5",
    gateway_pct: "1.95",
    gateway_mode: "pass_at_cost",
    payout_days: "2",
  };
  expect(parseSettings(fields, launchPricing)).toEqual(launchPricing);
  for (const invalid of [
    { payout_days: "2.5" },
    { payout_days: "366" },
    { platform_pct: "100.01" },
    { gateway_mode: "other" },
  ])
    expect(() => parseSettings({ ...fields, ...invalid }, launchPricing)).toThrow();
});
