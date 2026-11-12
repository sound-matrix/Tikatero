import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test("live paid checkout fails closed without captcha keys while free checkout works", async ({
  page,
}, info) => {
  test.skip(
    !process.env.CI || !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "Requires CI production-mode server and local Supabase.",
  );
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
    throw new Error("Use local Supabase only.");
  const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const id = crypto.randomUUID(),
    slug = `captcha-${id}`;
  expect(
    (await db.auth.admin.createUser({ id, email: `${slug}@example.test`, email_confirm: true }))
      .error,
  ).toBeNull();
  expect(
    (
      await db.from("organisers").insert({
        id,
        owner_id: id,
        slug,
        display_name: "Captcha Test Organiser",
        kyc_status: "approved",
        approved_at: new Date().toISOString(),
        cashfree_vendor_id: "local-test-vendor",
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await db.from("events").insert({
        id,
        organiser_id: id,
        slug,
        title: "Captcha checkout test",
        status: "published",
        starts_at: new Date(Date.now() + 86400000).toISOString(),
        is_free: false,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await db
        .from("ticket_types")
        .insert({ id, event_id: id, name: "Admission", price_paise: 10000, qty_total: 10 })
    ).error,
  ).toBeNull();
  await page.goto(`http://127.0.0.1:3001/e/${slug}/checkout`);
  await expect(
    page.getByText("Online payments are not available yet. Please check back soon."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pay/ })).toHaveCount(0);
  expect((await db.from("orders").select("id").eq("event_id", id)).data).toEqual([]);
  expect(
    (await db.from("checkout_holds").select("order_id").eq("ticket_type_id", id)).data,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath("checkout-fail-closed.png"), fullPage: true });
  expect((await db.from("events").update({ is_free: true }).eq("id", id)).error).toBeNull();
  await page.reload();
  await expect(page.getByRole("button", { name: "Confirm my free pass" })).toBeVisible();
  await expect(
    page.getByText("This site is protected by reCAPTCHA", { exact: false }),
  ).toBeVisible();
});
