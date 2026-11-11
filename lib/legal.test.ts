import { describe, expect, it } from "vitest";
import { FOOTER_CREDIT, footerLinks, helpParagraphs, legalPages } from "./legal";

const banned = [
  /GSTIN/i,
  /\bCIN\b/,
  /\bLLP\b/,
  /Ongole/i,
  /Andhra/i,
  /\b\d{6}\b/,
  /\b\d{10}\b/,
  /registered office/i,
];

describe("legal copy", () => {
  it("credits only Sound Matrix in the footer", () => {
    expect(FOOTER_CREDIT).toBe("© Sound Matrix");
    expect(FOOTER_CREDIT).not.toMatch(/\d/);
    expect(footerLinks.map((link) => link.label)).toEqual([
      "Terms",
      "Privacy",
      "Refunds",
      "Help",
      "Contact Us",
      "Pricing",
    ]);
    expect(footerLinks.map((link) => link.href)).toEqual([
      "/legal/terms",
      "/legal/privacy",
      "/legal/refunds",
      "/help",
      "/contact",
      "/pricing",
    ]);
  });

  it("does not include an address or a registration number", () => {
    const copy = [
      ...Object.values(legalPages).flatMap((page) => [
        ...page.paragraphs,
        "support" in page ? `${page.support.before} ${page.support.link}${page.support.after}` : "",
      ]),
      ...helpParagraphs,
      "Still need help? Contact us",
    ].join(" ");
    expect(copy).not.toContain("@");

    for (const pattern of banned) {
      expect(copy).not.toMatch(pattern);
    }
  });
});
