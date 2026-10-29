import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const sample = readFileSync("public/brand/tikatero-logo-horizontal.jpg");
const entity = "00000000-0000-4000-8000-000000000000";
const key = `poster/${entity}/f1111111-1111-4111-8111-111111111111.jpg`;
const signed = {
  url: "https://uploads.example.test/file",
  key,
  publicUrl: `https://media.example.test/${key}`,
  mime: "image/jpeg",
  expiresIn: 300,
};

// Browser transport fixtures only; the signing/role tests exercise the real API
// handlers separately with mocked S3. No R2 account or credentials are required.
test("upload component previews an image and reports progress and completion", async ({ page }) => {
  let metadata: unknown;
  await page.route("**/api/uploads/sign", async (route) => {
    metadata = route.request().postDataJSON();
    await route.fulfill({ status: 200, json: signed });
  });
  let transferred = 0;
  await page.route("https://uploads.example.test/**", async (route) => {
    if (route.request().method() === "PUT")
      transferred = route.request().postDataBuffer()?.byteLength ?? 0;
    await route.fulfill({
      status: route.request().method() === "OPTIONS" ? 204 : 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "PUT, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
      },
    });
  });
  await page.goto("/styleguide");
  const component = page.getByRole("region", { name: "Media upload component" });
  await component
    .getByLabel("Choose a photo")
    .setInputFiles({ name: "event-poster.jpg", mimeType: "image/jpeg", buffer: sample });
  await expect(component.getByAltText("Selected photo preview")).toBeVisible();
  await component.getByRole("button", { name: "Upload file" }).click();
  await expect(component.getByRole("status")).toHaveText("Your file has been uploaded.");
  await expect(component.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  expect(transferred).toBe(sample.byteLength);
  expect(metadata).toEqual({
    kind: "poster",
    entityId: entity,
    mime: "image/jpeg",
    size: sample.byteLength,
  });
});

test("upload component rejects wrong types and large images before requesting a URL", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/uploads/sign", async (route) => {
    calls++;
    await route.abort();
  });
  await page.goto("/styleguide");
  const component = page.getByRole("region", { name: "Media upload component" });
  const picker = component.getByLabel("Choose a photo");
  await picker.setInputFiles({
    name: "bad.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg/>"),
  });
  await expect(component.getByRole("status")).toContainText("JPG, PNG or WebP");
  await picker.setInputFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(component.getByRole("status")).toContainText(
    "This photo is too big — please use one under 5 MB",
  );
  await expect(component.getByRole("button", { name: "Upload file" })).toBeDisabled();
  expect(calls).toBe(0);
});

test("upload permission errors are readable", async ({ page }) => {
  await page.route("**/api/uploads/sign", (route) =>
    route.fulfill({ status: 403, json: { error: "You don’t have permission to upload here." } }),
  );
  await page.goto("/styleguide");
  const component = page.getByRole("region", { name: "Media upload component" });
  await component
    .getByLabel("Choose a photo")
    .setInputFiles({ name: "poster.jpg", mimeType: "image/jpeg", buffer: sample });
  await component.getByRole("button", { name: "Upload file" }).click();
  await expect(component.getByRole("status")).toHaveText(
    "You don’t have permission to upload here.",
  );
  await expect(component.getByRole("button", { name: "Upload file" })).toBeEnabled();
});
