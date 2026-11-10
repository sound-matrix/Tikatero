import { describe, expect, it } from "vitest";
import { computePricing } from "@/lib/pricing/compute";
import { launchPricing } from "@/lib/pricing";
import { formatIst } from "@/lib/format";
import {
  absorbedGatewayCost,
  expectedPayoutAt,
  ledgerConserves,
  organiserControlError,
  OWN_ORGANISER_CONTROL,
  payoutDecision,
  payoutWindowCopy,
  platformNet,
  settlementHoldPlan,
  assertPositivePaise,
  mockVendorId,
  matchingKycName,
} from "./model";

const lines = [{ price_paise: 100000, qty: 1 }];
const friday = new Date("2026-11-06T12:30:00.000Z");

describe("expected payout date", () => {
  it("waits until two working days after the next working-day settlement", () => {
    const expected = expectedPayoutAt({ paidAt: friday, payoutDays: 2 });
    expect(expected.toISOString()).toBe("2026-11-11T12:30:00.000Z");
    expect(formatIst(expected)).toBe("11 Nov 2026, 6:00 PM IST");
  });
  it("counts from a real settlement time when one exists", () => {
    const expected = expectedPayoutAt({
      paidAt: friday,
      payoutDays: 2,
      settledAt: new Date("2026-11-09T12:30:00.000Z"),
    });
    expect(expected.toISOString()).toBe("2026-11-11T12:30:00.000Z");
  });
  it("says payout within the saved number of days, in plain English", () => {
    expect(payoutWindowCopy(2)).toBe("Usually paid within 2 days of settlement.");
  });
});

describe("negative share and absorb mode", () => {
  it("never turns a negative or zero share into a payout", () => {
    expect(payoutDecision(-50)).toBe("flag");
    expect(payoutDecision(0)).toBe("skip");
    expect(payoutDecision(100)).toBe("schedule");
    expect(() => assertPositivePaise(0)).toThrow(/positive/);
    expect(() => assertPositivePaise(-1)).toThrow(/positive/);
  });
  it("keeps the order identity and tracks absorbed gateway cost apart from the payout", () => {
    const absorbVersion = { ...launchPricing, gateway_mode: "absorb" as const };
    const absorb = computePricing({
      lines,
      version: absorbVersion,
      fee_payer: "organiser",
      is_free: false,
    });
    expect(absorb.total.gateway_fee).toBe(0);
    expect(
      ledgerConserves({
        buyer_total: absorb.total.buyer_total,
        organiser_share: absorb.total.organiser_share,
        platform_share: absorb.total.platform_share,
        gateway_fee: absorb.total.gateway_fee,
      }),
    ).toBe(true);
    const cost = absorbedGatewayCost(lines, absorbVersion);
    expect(cost).toBe(2301);
    expect(platformNet(absorb.total.platform_share, cost)).toBe(absorb.total.platform_share - cost);
    expect(assertPositivePaise(absorb.total.organiser_share)).toBe(absorb.total.organiser_share);
    expect(absorb.total.organiser_share).toBeGreaterThan(absorb.total.organiser_share - cost);
  });
  it("does not invent an absorbed cost when the buyer already paid the gateway", () => {
    expect(absorbedGatewayCost(lines, launchPricing)).toBe(0);
  });
});

describe("hold self-check and live vendor calls", () => {
  it("refuses a staff member who owns or belongs to the organiser", () => {
    expect(organiserControlError("staff", "staff", [])).toBe(OWN_ORGANISER_CONTROL);
    expect(organiserControlError("staff", "owner", ["staff"])).toBe(OWN_ORGANISER_CONTROL);
    expect(organiserControlError("staff", "owner", ["someone-else"])).toBeNull();
  });
  it("calls Cashfree only for a real vendor when credentials exist", () => {
    expect(
      settlementHoldPlan({
        control: "payouts_on_hold",
        vendorId: "vendor_live",
        productionLocked: true,
        provider: "cashfree",
      }),
    ).toBe("call");
    expect(
      settlementHoldPlan({
        control: "payouts_on_hold",
        vendorId: mockVendorId("d1410001-0000-4000-8000-000000000001"),
        productionLocked: true,
        provider: "unconfigured",
      }),
    ).toBe("skip");
    expect(
      settlementHoldPlan({
        control: "payouts_on_hold",
        vendorId: "vendor_live",
        productionLocked: true,
        provider: "unconfigured",
      }),
    ).toBe("refuse");
    expect(
      settlementHoldPlan({
        control: "sales_paused",
        vendorId: "vendor_live",
        productionLocked: true,
        provider: "unconfigured",
      }),
    ).toBe("skip");
  });
  it("accepts a bank name that matches the KYC name", () => {
    expect(matchingKycName("Alex Shah", "Alex Shah")).toBe("Alex Shah");
    expect(matchingKycName("Someone Else", "Alex Shah")).toBeNull();
    expect(mockVendorId("d1410001-0000-4000-8000-000000000001")).toMatch(
      /^mock_vendor_[0-9a-f]{32}$/,
    );
  });
});
