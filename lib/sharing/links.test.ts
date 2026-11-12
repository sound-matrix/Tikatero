import { expect, it } from "vitest";
import { bookingPath, shareChannel, shareHref, shareText, type ShareEvent } from "./links";

const event: ShareEvent = {
  slug: "film-night",
  url: "https://tikatero.example/e/film-night",
  title: "Film & music",
  date: "22 Nov, 6 pm IST",
  city: "Hyderabad",
};

it.each([
  ["whatsapp", "wa.me", "text"],
  ["facebook", "www.facebook.com", "u"],
  ["x", "twitter.com", "url"],
  ["linkedin", "www.linkedin.com", "url"],
  ["telegram", "t.me", "url"],
] as const)("builds a %s share with its attribution", (channel, host, parameter) => {
  const url = new URL(shareHref(event, channel));
  expect(url.hostname).toBe(host);
  const link = `${event.url}?ref=${channel}`;
  expect(url.searchParams.get(parameter)).toBe(
    channel === "whatsapp" ? shareText(event, link) : link,
  );
});
it("tags copy, native, Instagram and email and only accepts named channels", () => {
  for (const channel of ["copy", "native", "instagram"] as const)
    expect(shareHref(event, channel)).toBe(`${event.url}?ref=${channel}`);
  const email = new URL(shareHref(event, "email"));
  expect(email.protocol).toBe("mailto:");
  expect(email.searchParams.get("body")).toContain("?ref=email");
  expect(shareChannel("whatsapp")).toBe("whatsapp");
  expect(shareChannel("__proto__")).toBeNull();
  expect(shareChannel(["whatsapp"])).toBeNull();
  expect(bookingPath(event.slug, "checkout", "ticket", "whatsapp")).toBe(
    "/e/film-night/checkout?tier=ticket&ref=whatsapp",
  );
});
