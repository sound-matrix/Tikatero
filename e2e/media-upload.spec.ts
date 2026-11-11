import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const sample = readFileSync("public/brand/tikatero-logo-horizontal.jpg");
const entity = "00000000-0000-4000-8000-000000000000";
const key = `media/poster/${entity}/f1111111-1111-4111-8111-111111111111.jpg`;
const signed = {
  url: "/api/uploads/file",
  key,
  publicUrl: `https://project.supabase.co/storage/v1/object/public/event-media/${key}`,
  mime: "image/jpeg",
  expiresIn: 300,
};

// Browser transport fixtures only; the signing/role tests exercise the real API
// handlers separately; the integration test below uses the local Storage service.
test("upload component previews an image and reports progress and completion", async ({ page }) => {
  let metadata: unknown;
  await page.route("**/api/uploads/sign", async (route) => {
    metadata = route.request().postDataJSON();
    await route.fulfill({ status: 200, json: signed });
  });
  let transferred = 0;
  await page.route("**/api/uploads/file?part=*", async (route) => {
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

// This fixture writes only to the disposable local/CI Supabase project.
test("an authenticated organiser uploads and renders a real Supabase event image", async ({
  page,
}, info) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  test.skip(!url || !serviceKey, "Requires local Supabase Storage.");
  if (!["127.0.0.1", "localhost"].includes(new URL(url!).hostname))
    throw new Error("Storage test requires local Supabase.");
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const id = crypto.randomUUID(),
    email = `storage-${id}@example.test`;
  const user = await db.auth.admin.createUser({ id, email, email_confirm: true });
  expect(user.error).toBeNull();
  expect(
    (
      await db.from("organisers").insert({
        id,
        owner_id: id,
        slug: `storage-${id}`,
        display_name: "Storage Test Organiser",
        kyc_status: "approved",
        approved_at: new Date().toISOString(),
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await db.from("events").insert({
        id: entity,
        organiser_id: id,
        slug: `storage-${id}`,
        title: "Supabase Media Preview",
        status: "published",
        starts_at: new Date(Date.now() + 86400000).toISOString(),
        is_free: true,
      })
    ).error,
  ).toBeNull();
  const link = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw new Error("Could not create storage session.");
  await page.goto(
    `/auth/callback?token_hash=${encodeURIComponent(link.data.properties.hashed_token)}&type=email`,
  );
  await expect(page).toHaveURL(/\/console$/);
  await page.goto("/styleguide");
  const component = page.getByRole("region", { name: "Media upload component" });
  // Two parts exercise the Vercel-safe path, preserving the valid JPEG bytes.
  const largeSample = Buffer.concat([sample, Buffer.alloc(3 * 1024 * 1024)]);
  await component
    .getByLabel("Choose a photo")
    .setInputFiles({ name: "event-poster.jpg", mimeType: "image/jpeg", buffer: largeSample });
  const signing = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/uploads/sign") && response.request().method() === "POST",
  );
  await component.getByRole("button", { name: "Upload file" }).click();
  const result = await (await signing).json();
  await expect(component.getByRole("status")).toHaveText("Your file has been uploaded.");
  await expect(component.getByAltText("Selected photo preview")).toHaveAttribute(
    "src",
    result.publicUrl,
  );
  const stored = await page.request.get(result.publicUrl);
  expect(stored.status()).toBe(200);
  expect((await stored.body()).equals(largeSample)).toBe(true);
  expect(
    (await db.from("events").update({ poster_key: result.key }).eq("id", entity)).error,
  ).toBeNull();
  await page.goto(`/e/storage-${id}`);
  const image = page.getByAltText("Supabase Media Preview poster");
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath("supabase-event-image.png"), fullPage: true });
  await db.storage.from("event-media").remove([result.key]);
  await db.from("events").delete().eq("id", entity);
});
