import { expect, test } from "@playwright/test";

test.describe("homepage welcome animation", () => {
  test("Chrome uses the animated GIF at desktop and phone widths", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });

    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 850 });
      await page.goto("/");
      const image = page.locator('picture img[alt*="QR ticket"]');
      await expect(image).toBeVisible();
      await expect
        .poll(() => image.evaluate((img: HTMLImageElement) => new URL(img.currentSrc).pathname))
        .toBe("/animations/tikatero-welcome-entry.gif");
      await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    }
  });

  test("reduced-motion preference uses the accessible static poster", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 850 });
    await page.goto("/");
    const image = page.locator('picture img[alt*="QR ticket"]');
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => new URL(img.currentSrc).pathname))
      .toBe("/animations/tikatero-welcome-poster.png");
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  });
});
