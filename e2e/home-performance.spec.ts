import { expect, test } from "@playwright/test";

test.describe("Phase 07 responsive hero media", () => {
  test("mobile uses a responsive static poster and avoids GIF downloads", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const fetched: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/animations/tikatero-welcome-entry.gif")) fetched.push(request.url());
    });
    await page.goto("/");
    const hero = page.locator("picture").filter({
      has: page.locator('img[alt="A guest approaches the Welcome Tikatero venue entrance with a QR ticket."]'),
    });
    await expect(hero).toHaveCount(1);
    await expect(hero.locator("source")).toHaveAttribute("media", /min-width: 640px/);
    await expect(hero.locator("img")).toBeVisible();
    await expect(hero.locator("img")).toHaveJSProperty("complete", true);
    expect(fetched).toHaveLength(0);
    expect(await hero.locator("img").evaluate((img: HTMLImageElement) => img.currentSrc)).not.toContain(".gif");
  });

  test("desktop can use the animated hero without losing poster fallback", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    const hero = page.locator("picture").filter({
      has: page.locator('img[alt="A guest approaches the Welcome Tikatero venue entrance with a QR ticket."]'),
    });
    await expect(hero).toHaveCount(1);
    await expect(hero.locator("source")).toHaveAttribute(
      "srcset",
      "/animations/tikatero-welcome-entry.gif",
    );
    expect(await hero.locator("img").evaluate((img: HTMLImageElement) => img.currentSrc))
      .toContain("tikatero-welcome-entry.gif");
  });
});
