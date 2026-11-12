import { expect, it } from "vitest";
import { cleanSocialLink, indianCheckoutPhone, maskedUpi, phoneE164, validUpi } from "./profile";

it.each([
  ["instagram", "@anthony.teja", "https://instagram.com/anthony.teja"],
  [
    "instagram",
    "https://www.instagram.com/anthony/?utm_source=test",
    "https://www.instagram.com/anthony/",
  ],
  ["linkedin", "Anthony", "https://linkedin.com/in/Anthony"],
  ["x", "twitter.com/anthony", "https://twitter.com/anthony"],
  ["website", "example.com", "https://example.com/"],
] as const)("normalises %s profile links", (platform, input, url) => {
  expect(cleanSocialLink(platform, input)?.url).toBe(url);
});

it.each([
  "javascript:alert(1)",
  "https://example.com/anthony",
  "https://instagram.com.example.com/anthony",
  "https://instagram.com@bad.example/anthony",
  "https://bad.example@instagram.com/anthony",
  "//instagram.com/anthony",
])("rejects misleading or external Instagram input %s", (input) => {
  expect(cleanSocialLink("instagram", input)).toBeNull();
});

it("stores international E.164 numbers and only prefills supported Indian checkout numbers", () => {
  expect(phoneE164("98765 43210")).toBe("+919876543210");
  expect(phoneE164("(415) 555-0132", "US")).toBe("+14155550132");
  expect(phoneE164("+44 7400 123456")).toBe("+447400123456");
  expect(phoneE164("call 9876543210")).toBeNull();
  expect(indianCheckoutPhone("+91 98765 43210")).toBe("9876543210");
  expect(indianCheckoutPhone("+14155550132")).toBe("");
});

it("validates and masks UPI IDs", () => {
  expect(validUpi("anthony.terish@okaxis")).toBe(true);
  for (const invalid of ["anthony", "a@@bank", "a b@bank", "name@", "@bank"])
    expect(validUpi(invalid)).toBe(false);
  expect(maskedUpi("anthony.terish@okaxis")).toBe("an•••@okaxis");
  expect(maskedUpi("a@bank")).toBe("•••@bank");
});
