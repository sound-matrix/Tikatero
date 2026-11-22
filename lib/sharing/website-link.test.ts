import { describe, expect, it } from "vitest";
import { organiserWebsiteLink } from "./website-link";

describe("organiser website link", () => {
  it("generates a crawlable HTTPS anchor to a canonical public event", () => {
    expect(organiserWebsiteLink("sample-music-night", "Sample Music Night"))
      .toBe('<a href="https://tikatero.com/e/sample-music-night">Tickets for Sample Music Night on Tikatero</a>');
  });
  it("escapes organiser-provided titles to prevent HTML injection", () => {
    const link = organiserWebsiteLink("concert", '<script>alert("hello")</script> & show');
    expect(link).not.toContain("<script>");
    expect(link).toContain("&lt;script&gt;");
    expect(link).toContain("&quot;");
    expect(link).toContain("&amp;");
  });
  it("rejects unexpected or traversal slugs", () => {
    expect(() => organiserWebsiteLink("../private", "Private")).toThrow();
    expect(() => organiserWebsiteLink("UPPER", "Not canonical")).toThrow();
    expect(() => organiserWebsiteLink("a".repeat(161), "Too long")).toThrow();
  });
});
