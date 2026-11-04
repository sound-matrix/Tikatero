import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const configured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
test.describe("Attendee discovery", () => {
  test.skip(!configured, "Requires the local discovery fixture.");
  test("finds the published event on home, listing and detail; filters remember location", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Sample Music Night", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "See all events" }).click();
    await expect(page).toHaveURL(/\/events(?:\?|$)/);
    await expect(
      page.getByRole("heading", { name: "Find your next event", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Sample Music Night", exact: true }),
    ).toBeVisible();
    const searchForm = page.getByRole("search", { name: "Find events", exact: true });
    await searchForm.getByLabel("City", { exact: true }).fill("Hyderabad");
    await searchForm.getByLabel("Country", { exact: true }).selectOption("IN");
    await searchForm.getByLabel("Ticket price", { exact: true }).selectOption("paid");
    await searchForm.getByRole("button", { name: "Find events", exact: true }).click();
    await expect(page).toHaveURL(/city=Hyderabad/);
    await expect
      .poll(
        async () =>
          (await page.context().cookies()).find((c) => c.name === "tikatero-location")?.value,
      )
      .toContain("Hyderabad");
    await page.getByRole("heading", { name: "Sample Music Night", exact: true }).click();
    await expect(page).toHaveURL(/\/e\/sample-music-night$/);
    await expect(
      page.getByRole("heading", { name: "Sample Music Night", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("✓ Verified organiser", { exact: true })).toBeVisible();
    await expect(page.getByText("₹ 1,000 incl. GST", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Sold out", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Not on sale yet", exact: true })).toBeDisabled();
    await expect(page.getByRole("link", { name: "Open in Maps ↗" })).toHaveAttribute(
      "href",
      /17.385/,
    );
    const structured = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? "null",
    );
    expect(structured).toMatchObject({
      "@type": "Event",
      name: "Sample Music Night",
      url: "http://127.0.0.1:3000/e/sample-music-night",
    });
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/e\/sample-music-night$/,
    );
    await expect(page.getByRole("contentinfo")).toHaveText("© Sound Matrix");
    await page.getByRole("link", { name: "Book", exact: true }).filter({ visible: true }).click();
    await expect(page.getByRole("heading", { name: "Choose your tickets" })).toBeVisible();
    await page.goto("/");
    await expect(searchForm.getByLabel("City", { exact: true })).toHaveValue("Hyderabad");
  });
  test("draft and paused events are 404 including booking and OG routes", async ({
    request,
    page,
  }) => {
    for (const slug of ["discovery-draft", "discovery-paused"]) {
      const response = await request.get(`/e/${slug}`);
      expect(response.status()).toBe(404);
      expect((await page.goto(`/e/${slug}/book`))?.status()).toBe(404);
      await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
      expect((await request.get(`/e/${slug}/opengraph-image`)).status()).toBe(404);
    }
  });
  test("free RSVP and friendly empty states", async ({ page }) => {
    await page.goto("/events?city=&country=&price=free");
    await expect(page.getByRole("heading", { name: "Community RSVP", exact: true })).toBeVisible();
    await page.getByRole("heading", { name: "Community RSVP", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Free — RSVP", exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "RSVP", exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await page.goto("/events?city=NoSuchCity&country=");
    await expect(page.getByRole("heading", { name: "No events here yet" })).toBeVisible();
  });
  test("event page passes axe on desktop and mobile, with screenshots", async ({ page }, info) => {
    for (const [name, width, height] of [
      ["desktop", 1440, 1050],
      ["mobile", 390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/e/sample-music-night");
      await expect(
        page.getByRole("heading", { name: "Sample Music Night", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Share event" })).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({ path: info.outputPath(`discovery-${name}.png`), fullPage: true });
      for (const [surface, url] of [
        ["home", "/"],
        ["listing", "/events"],
      ] as const) {
        await page.goto(url);
        await expect(
          page.getByRole("heading", { name: "Sample Music Night", exact: true }),
        ).toBeVisible();
        await expect(page.getByRole("button", { name: "Find events", exact: true })).toBeEnabled();
        await page.screenshot({
          path: info.outputPath(`discovery-${surface}-${name}.png`),
          fullPage: true,
        });
      }
    }
  });
  test("copies a share link when Web Share is unavailable", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true }),
    );
    await page.goto("/e/sample-music-night");
    await page.getByRole("button", { name: "Share event" }).click();
    await expect(page.getByRole("status")).toContainText("Link copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "http://127.0.0.1:3000/e/sample-music-night",
    );
  });
  test("Open Graph image is a real PNG", async ({ request }) => {
    const response = await request.get("/e/sample-music-night/opengraph-image");
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
  });
});
