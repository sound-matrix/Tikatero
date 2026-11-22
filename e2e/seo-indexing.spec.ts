import { expect, test } from "@playwright/test";

test.describe("Phase 08 search indexing hygiene", () => {
  test("clean discovery URL is indexable and canonical", async ({ page }) => {
    await page.goto("/events");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://tikatero.com/events",
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /index, follow/,
    );
  });
  test("search, filters and pagination are noindex but continue following links", async ({ page }) => {
    for (const url of [
      "/events?q=music",
      "/events?city=Hyderabad&country=IN",
      "/events?category=Workshop",
      "/events?page=2",
    ]) {
      await page.goto(url);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        /noindex, follow/,
      );
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        "https://tikatero.com/events",
      );
    }
  });
  test("social upcoming feed is not an indexable duplicate", async ({ page }) => {
    await page.goto("/events/upcoming");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/events$/,
    );
  });
});
