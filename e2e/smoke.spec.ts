import { expect, test } from "@playwright/test";

test("home loads and the Tikatero logo is visible", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Find events near you — or anywhere in the world" }),
  ).toBeVisible();
  const logo = page.getByRole("link", { name: "Tikatero home" });
  await expect(logo).toBeVisible();
  await expect(logo.getByRole("img", { name: "Tikatero" })).toBeVisible();

  const footer = page.getByRole("contentinfo");
  await expect(footer).toContainText("© Sound Matrix");
  await expect(footer).toHaveText("© Sound Matrix");
  await expect(footer).not.toContainText(/GSTIN|CIN|LLP|Ongole|Andhra/i);
});

test("styleguide shows ₹1,000 including GST", async ({ page }) => {
  await page.goto("/styleguide");
  await expect(page.getByRole("heading", { name: "Design system" })).toBeVisible();
  await expect(page.getByText("₹1,000", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("incl. GST").first()).toBeVisible();
  await expect(page.getByRole("contentinfo")).toContainText("© Sound Matrix");
});
