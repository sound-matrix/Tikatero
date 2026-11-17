import { describe, expect, it } from "vitest";
import { instagramEventCaption, instagramTicketUrl } from "./instagram";

describe("instagram ticket links", () => {
  it.each(["story", "bio", "ad"] as const)("preserves Instagram attribution for %s", (placement) => {
    const url = new URL(instagramTicketUrl("https://tikatero.com", "concert-night", placement));
    expect(url.origin).toBe("https://tikatero.com");
    expect(url.pathname).toBe("/e/concert-night/book");
    expect(url.searchParams.get("ref")).toBe("instagram");
    expect(url.searchParams.get("utm_source")).toBe("instagram");
    expect(url.searchParams.get("utm_content")).toBe(
      placement === "ad" ? "paid_ad" : placement,
    );
  });
  it("generates a booking caption", () => {
    expect(instagramEventCaption("Concert", "Hyderabad", "https://tikatero.com/e/concert"))
      .toContain("Concert · Hyderabad");
  });
});
