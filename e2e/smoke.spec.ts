import { expect, test } from "@playwright/test";

test("home loads and the Tikatero logo is visible", async ({ page }) => {
  const response = await page.goto("/");
  const headers = response?.headers() ?? {};
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).toContain("https://www.google.com/recaptcha/");
  expect(headers["content-security-policy"]).not.toContain("unsafe-eval");
  await expect(
    page.getByRole("heading", { name: "Find events near you — or anywhere in the world" }),
  ).toBeVisible();
  const logo = page.getByRole("link", { name: "Tikatero home" });
  await expect(logo).toBeVisible();
  await expect(logo.getByRole("img", { name: "Tikatero" })).toBeVisible();

  const footer = page.getByRole("contentinfo");
  await expect(footer).toContainText("© Sound Matrix");
  await expect(footer.getByRole("link", { name: "Terms" })).toBeVisible();
  await expect(footer.getByRole("link", { name: "Privacy" })).toBeVisible();
  await expect(footer.getByRole("link", { name: "Refunds" })).toBeVisible();
  await expect(footer.getByRole("link", { name: "Help" })).toBeVisible();
  await expect(footer).not.toContainText(/GSTIN|\bCIN\b|\bLLP\b|Ongole|Andhra/i);
});

test("login sends the same security headers", async ({ request }) => {
  const response = await request.get("/login");
  expect(response.status()).toBe(200);
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
});

test("a missing ticket url is not found", async ({ request }) => {
  for (const path of ["/t/NOT-A-TICKET", "/t/TK-NOT01-01"]) {
    const response = await request.get(path);
    const body = await response.text();
    expect(response.status()).toBe(404);
    expect(body).toContain("Page not found");
    expect(body).not.toContain("Loading your ticket");
  }
});

test("styleguide shows ₹1,000 including GST", async ({ page }) => {
  await page.goto("/styleguide");
  await expect(page.getByRole("heading", { name: "Design system" })).toBeVisible();
  await expect(page.getByText("₹1,000", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("incl. GST").first()).toBeVisible();
  await expect(page.getByRole("contentinfo")).toContainText("© Sound Matrix");
});
