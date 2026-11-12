import { expect, test } from "@playwright/test";

const hidden = ["@sound-matrix.com", "soundmatrix6"];

async function expectNoHiddenAddress(page: import("@playwright/test").Page) {
  const html = await page.content();
  for (const value of hidden) expect(html).not.toContain(value);
}

test("contact form, pricing, and footer links", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.getByRole("heading", { name: "Contact us" })).toBeVisible();
  await expect(
    page.getByText(/reply to your email, usually within 1–2 working days/),
  ).toBeVisible();
  await expect(
    page.getByText("This site is protected by reCAPTCHA", { exact: false }),
  ).toBeVisible();
  await expectNoHiddenAddress(page);
  await page.screenshot({ path: "test-results/contact-empty.png", fullPage: true });

  await page.getByLabel("Full name").fill("Priya Shah");
  await page.getByLabel("Email").fill("priya@example.test");
  await page.getByLabel("What is it about?").selectOption("refund");
  await page.getByLabel("Message").fill("I need help with a refund for my booking.");
  await page.locator('input[name="started"]').evaluate((element) => {
    (element as HTMLInputElement).value = String(Date.now() - 10_000);
  });
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByText("Thanks, Priya! We've got your message and will reply to priya@example.test."),
  ).toBeVisible();
  await expectNoHiddenAddress(page);
  await page.screenshot({ path: "test-results/contact-success.png", fullPage: true });

  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: "Pricing", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "₹500", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "₹1,000", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "₹2,500", exact: true })).toBeVisible();
  await expect(page.getByText(/include GST/i).first()).toBeVisible();
  await expect(
    page.getByText(
      "Tikatero collects ticket money for you and sends your earnings to your bank account within 2 working days after your event ends. You'll get an email with the bank reference each time.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Start selling tickets" })).toHaveAttribute(
    "href",
    "/console",
  );
  await expectNoHiddenAddress(page);
  await page.screenshot({ path: "test-results/pricing-page.png", fullPage: true });

  const footer = page.getByRole("contentinfo");
  await expect(footer).toContainText("© Sound Matrix");
  await expect(footer.getByRole("link", { name: "Contact Us" })).toHaveAttribute(
    "href",
    "/contact",
  );
  await expect(footer.getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing");
  await expect(footer.getByRole("link", { name: "Terms" })).toBeVisible();
  await expect(footer.getByRole("link", { name: "Privacy" })).toBeVisible();
  await expect(footer.getByRole("link", { name: "Refunds" })).toBeVisible();
  await expect(footer.getByRole("link", { name: "Help" })).toBeVisible();
  await footer.screenshot({ path: "test-results/footer-links.png" });

  await page.goto("/help");
  await expect(page.getByRole("link", { name: "Still need help? Contact us" })).toHaveAttribute(
    "href",
    "/contact",
  );
  await page.goto("/legal/terms");
  await expect(page.getByRole("link", { name: "contact support" })).toHaveAttribute(
    "href",
    "/contact",
  );
  await page.goto("/legal/refunds");
  await expect(page.getByRole("link", { name: "contact support" })).toHaveAttribute(
    "href",
    "/contact",
  );
  await expectNoHiddenAddress(page);
});
