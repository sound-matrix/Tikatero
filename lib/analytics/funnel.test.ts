import { afterEach, describe, expect, it, vi } from "vitest";
import { trackFunnelEvent } from "./funnel";

afterEach(() => vi.unstubAllGlobals());

describe("privacy-safe conversion tracking", () => {
  it("sends the event with allowed anonymous funnel dimensions", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag });
    trackFunnelEvent("begin_checkout", { admission: "paid" });
    expect(gtag).toHaveBeenCalledWith("event", "begin_checkout", { admission: "paid" });
  });
  it("never forwards arbitrary PII or payment identifiers", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag });
    trackFunnelEvent(
      "organiser_signup_intent",
      { role: "organiser", email: "private@example.com", order_id: "secret" } as never,
    );
    expect(gtag).toHaveBeenCalledWith("event", "organiser_signup_intent", {
      role: "organiser",
    });
  });
  it("does nothing when analytics is disabled or outside the browser", () => {
    vi.stubGlobal("window", { gtag: undefined });
    expect(() => trackFunnelEvent("organiser_email_verified")).not.toThrow();
    vi.stubGlobal("window", undefined);
    expect(() => trackFunnelEvent("ticket_reservation_created")).not.toThrow();
  });
  it("ignores unsupported dimension values", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag });
    trackFunnelEvent("ticket_reservation_created", {
      admission: "unverified" as "paid",
      role: "admin" as "organiser",
    });
    expect(gtag).toHaveBeenCalledWith("event", "ticket_reservation_created", {});
  });
});
