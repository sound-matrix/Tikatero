import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
const configured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
function check<T extends { error: unknown }>(result: T) {
  if (result.error) throw new Error("Checkout fixture failed.");
  return result;
}
async function fixture(options: { free?: boolean; paused?: boolean } = {}) {
  const client = db(),
    id = randomUUID(),
    slug = `checkout-${id}`;
  check(
    await client.auth.admin.createUser({ id, email: `${slug}@example.test`, email_confirm: true }),
  );
  check(
    await client.from("organisers").insert({
      id,
      owner_id: id,
      slug,
      display_name: "Checkout organiser",
      kyc_status: "approved",
      approved_at: new Date().toISOString(),
    }),
  );
  check(
    await client.from("events").insert({
      id,
      organiser_id: id,
      slug,
      title: options.free ? "Community film workshop" : "Cinema under the stars",
      starts_at: new Date(Date.now() + 86400000 * 10).toISOString(),
      status: "published",
      is_free: options.free ?? false,
      fee_payer: "buyer",
      venue_name: "Riverfront Hall",
    }),
  );
  check(
    await client.from("ticket_types").insert({
      id,
      event_id: id,
      name: options.free ? "RSVP" : "General admission",
      price_paise: options.free ? 0 : 100000,
      qty_total: 10,
      per_order_max: 2,
    }),
  );
  if (options.paused)
    check(await client.from("organisers").update({ sales_paused: true }).eq("id", id));
  return { id, slug };
}
async function fill(page: import("@playwright/test").Page, slug: string, free = false) {
  await page.goto(`/e/${slug}/checkout`);
  await page.getByLabel(free ? "RSVP quantity" : "General admission quantity").selectOption("1");
  await page.getByLabel("Full name", { exact: true }).fill("Jamie Rao");
  await page.getByLabel("Email", { exact: true }).fill(`buyer-${randomUUID()}@example.test`);
  await page.getByLabel("Phone", { exact: true }).fill("9876543210");
  await page.getByRole("checkbox").check();
}
test.describe("Guest checkout", () => {
  test.skip(!configured, "Requires local Supabase.");
  test("mock success confirms once and never issues PR 12 tickets", async ({
    page,
    request,
  }, info) => {
    const { id, slug } = await fixture();
    await fill(page, slug);
    for (const [label, width, height] of [
      ["desktop", 1440, 1100],
      ["mobile", 390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: info.outputPath(`checkout-${label}.png`), fullPage: true });
    }
    await page.getByRole("button", { name: /^Pay ₹/ }).click();
    await expect(page.getByRole("heading", { name: "Test payment", exact: true })).toBeVisible();
    await expect(
      page.getByRole("main").getByText("Test mode — no real money", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Success", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Booking confirmed" })).toBeVisible();
    const orderId = /\/orders\/([^/]+)/.exec(page.url())![1];
    await page.reload();
    await expect(page.getByRole("heading", { name: "Booking confirmed" })).toBeVisible();
    const client = db();
    expect(
      check(await client.from("ticket_types").select("qty_sold").eq("id", id).single()).data!
        .qty_sold,
    ).toBe(1);
    expect(
      check(
        await client
          .from("order_outbox")
          .select("id")
          .eq("order_id", orderId)
          .eq("topic", "order.paid"),
      ).data,
    ).toHaveLength(1);
    expect(
      check(await client.from("tickets").select("id").eq("order_id", orderId)).data,
    ).toHaveLength(0);
    // A different browser/request without the private order cookie gets no order data.
    expect((await request.get(`/orders/${orderId}/status/poll`)).status()).toBe(404);
    await page.screenshot({ path: info.outputPath("checkout-confirmed.png"), fullPage: true });
  });
  test("mock failure releases inventory", async ({ page }) => {
    const { id, slug } = await fixture();
    await fill(page, slug);
    await page.getByRole("button", { name: /^Pay ₹/ }).click();
    await page.getByRole("button", { name: "Fail", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Booking not completed" })).toBeVisible();
    const orderId = /\/orders\/([^/]+)/.exec(page.url())![1],
      client = db();
    expect(
      check(await client.from("ticket_types").select("qty_sold").eq("id", id).single()).data!
        .qty_sold,
    ).toBe(0);
    expect(
      check(
        await client.from("checkout_holds").select("released_at").eq("order_id", orderId).single(),
      ).data!.released_at,
    ).not.toBeNull();
  });
  test("free RSVP skips payment", async ({ page }) => {
    const { id, slug } = await fixture({ free: true });
    await fill(page, slug, true);
    await page.getByRole("button", { name: "Confirm RSVP", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Booking confirmed" })).toBeVisible();
    expect(
      check(await db().from("ticket_types").select("qty_sold").eq("id", id).single()).data!
        .qty_sold,
    ).toBe(1);
  });
  test("paused organiser sees friendly block", async ({ page }) => {
    const { slug } = await fixture({ paused: true });
    await page.goto(`/e/${slug}/checkout`);
    await expect(page.getByRole("heading", { name: "Booking unavailable" })).toBeVisible();
    await expect(page.getByText(/Ticket sales are temporarily paused/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Pay/ })).toHaveCount(0);
  });
});
