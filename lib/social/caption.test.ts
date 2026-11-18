import { describe, expect, it } from "vitest";
import {
  buildSocialCaption,
  captionMentionsAllowed,
  finalizeCaption,
  isTestEvent,
  socialPriceLabel,
  testEventFixtures,
} from "@/lib/social/caption";
import { facebookTicketUrl } from "@/lib/sharing/instagram";

const starts = "2026-11-07T12:30:00.000Z";

const paid = {
  title: "City Lights",
  slug: "city-lights",
  starts_at: starts,
  venue_name: "Sound Hall",
  city: "Hyderabad",
  category: "Comedy",
  is_free: false,
  min_price_paise: 49900,
  tiers: [{ price_paise: 49900 }],
};

describe("social captions", () => {
  it("matches the SQL test-event fixtures", () => {
    for (const fixture of testEventFixtures) {
      expect(isTestEvent(fixture), `${fixture.title} / ${fixture.slug} / ${fixture.is_test}`).toBe(
        fixture.expected,
      );
    }
  });

  it("prices a free event, one price, a from price, and tickets that are not on sale", () => {
    expect(socialPriceLabel({ is_free: true, min_price_paise: null })).toBe("Free entry");
    expect(socialPriceLabel(paid)).toBe("₹ 499 incl. GST");
    expect(
      socialPriceLabel({
        ...paid,
        min_price_paise: 49900,
        tiers: [{ price_paise: 49900 }, { price_paise: 99900 }],
      }),
    ).toBe("From ₹ 499 incl. GST");
    expect(socialPriceLabel({ is_free: false, min_price_paise: null })).toBe("Tickets coming soon");
  });

  it("builds Instagram and Facebook captions in IST", () => {
    const instagram = buildSocialCaption({
      platform: "instagram",
      kind: "feed",
      event: paid,
      origin: "https://tikatero.com",
    });
    expect(instagram).toContain("🎟️ City Lights");
    expect(instagram).toContain("📅 7 Nov 2026, 6:00 PM IST");
    expect(instagram).toContain("📍 Sound Hall, Hyderabad");
    expect(instagram).toContain("💰 ₹ 499 incl. GST");
    expect(instagram).toContain("Book: tikatero.com/e/city-lights");
    expect(instagram).toContain("🔗 Link in bio: @tikatero_official");
    expect(instagram).not.toContain("utm_source=facebook");
    expect(instagram).toContain("#hyderabadevents #hyderabad #comedyshow #tikatero");

    const facebook = buildSocialCaption({
      platform: "facebook",
      kind: "feed",
      event: paid,
      origin: "https://tikatero.com",
    });
    expect(facebook).toContain(
      `Book here: ${facebookTicketUrl("https://tikatero.com", "city-lights")}`,
    );
    expect(facebook).toContain("utm_source=facebook");
    expect(facebook).toContain("utm_medium=organic_social");
    expect(facebook).toContain("ref=facebook");
    expect(facebook).not.toContain("@tikatero_official");
    expect(captionMentionsAllowed(instagram, null)).toBe(true);
    expect(captionMentionsAllowed(facebook, null)).toBe(true);
  });

  it("drops an empty venue, prefixes last seats, and strips control characters", () => {
    const caption = buildSocialCaption({
      platform: "instagram",
      kind: "last_seats",
      origin: "https://tikatero.com",
      event: {
        ...paid,
        title: "City\u0000 Lights",
        venue_name: null,
        is_free: true,
        tiers: [],
      },
    });
    expect(caption.startsWith("⚡ Last few seats left!")).toBe(true);
    expect(caption).toContain("🎟️ City Lights");
    expect(caption).toContain("📍 Hyderabad");
    expect(caption).not.toContain("Sound Hall");
    expect(caption).toContain("💰 Free entry");
    expect(caption).not.toContain("\u0000");
  });

  it("enforces length, hashtag and mention limits", () => {
    const hashtags = Array.from({ length: 31 }, (_, index) => `#tag${index}`).join(" ");
    const mentions = Array.from({ length: 21 }, (_, index) => `@person${index}`).join(" ");
    const limited = finalizeCaption(`${hashtags}\n${mentions}\n${"a".repeat(2300)}`);
    expect(limited.length).toBeLessThanOrEqual(2200);
    expect(limited.match(/#tag/g)?.length).toBe(30);
    expect(limited.match(/@person/g)?.length).toBe(20);
    expect(
      buildSocialCaption({
        platform: "instagram",
        kind: "feed",
        event: paid,
        origin: "https://tikatero.com",
      }).length,
    ).toBeLessThanOrEqual(2200);
    expect(captionMentionsAllowed("Hello @someone", null)).toBe(false);
    expect(captionMentionsAllowed("Hello @tikatero_official @host.name", "host.name")).toBe(true);
  });
});
