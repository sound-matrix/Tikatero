import { describe, expect, it } from "vitest";
import { FOOTER_CREDIT, footerLinks, legalPages } from "./legal";

const banned = [/GSTIN/i, /\bCIN\b/, /\bLLP\b/, /Ongole/i, /Andhra/i, /\b\d{6}\b/];

describe("legal copy", () => {
  it("credits only Sound Matrix in the footer", () => {
    expect(FOOTER_CREDIT).toBe("© Sound Matrix");
    expect(FOOTER_CREDIT).not.toMatch(/\d/);
    expect(footerLinks.map((link) => link.label)).toEqual(["Terms", "Privacy", "Refunds", "Help"]);
  });

  it("does not include an address or a registration number", () => {
    const copy = Object.values(legalPages)
      .flatMap((page) => page.paragraphs)
      .join(" ");

    for (const pattern of banned) {
      expect(copy).not.toMatch(pattern);
    }
  });
});
