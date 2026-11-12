import { expect, it } from "vitest";
import { returnPath, signOutPath, withReturnPath } from "./return-path";

it("keeps an event's referral and ticket in the return path", () => {
  expect(withReturnPath("/login", "/e/cinema/checkout?tier=123&ref=whatsapp")).toBe(
    "/login?next=%2Fe%2Fcinema%2Fcheckout%3Ftier%3D123%26ref%3Dwhatsapp",
  );
  expect(signOutPath("/e/cinema?ref=copy")).toBe("/e/cinema?ref=copy");
  expect(signOutPath("/console/events")).toBe("/");
});
it.each([
  "https://evil.test",
  "//evil.test",
  "/a/..//evil.test",
  "/\\evil.test",
  "/%2f%2fevil.test",
  "/me\n",
  "/auth/callback",
  "/api/events/share",
  "/login?next=%2F",
])("rejects %s", (path) => {
  expect(returnPath(path)).toBeNull();
});
